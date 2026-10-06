import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/db/client";
import { dataMode, getEnv, requireKey } from "@/server/env";
import { ExternalGateway, jsonValue } from "@/server/external";
import { socialAuthorSchema, type SocialAuthor } from "@/types/social";

const DAY_MS = 86400000;
const LEASE_MS = 120000;
const FAILURE_TTL_MS = 300000;
const responseSchema = z.object({
  data: z.array(z.unknown()).max(100).optional(),
  errors: z.array(z.unknown()).max(100).optional(),
});
const entrySchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("available"), profile: socialAuthorSchema }),
  z.object({ state: z.literal("pending"), lease: z.string() }),
  z.object({ state: z.literal("missing") }),
  z.object({ state: z.literal("unavailable") }),
]);

export function normalizeXProfiles(raw: unknown, ids: string[], now = new Date()) {
  const response = responseSchema.parse(raw);
  const requested = new Set(ids);
  const profiles = new Map<string, SocialAuthor>();
  for (const row of response.data ?? []) {
    if (!row || typeof row !== "object") continue;
    const user = row as Record<string, unknown>;
    const metrics = user.public_metrics as Record<string, unknown> | undefined;
    const entities = user.entities as { url?: { urls?: { expanded_url?: unknown }[] } } | undefined;
    const website = entities?.url?.urls?.[0]?.expanded_url ?? user.url;
    const safeWebsite = socialAuthorSchema.shape.website.safeParse(website || null);
    const parsed = socialAuthorSchema.safeParse({
      id: user.id,
      username: user.username,
      name: typeof user.name === "string" ? user.name.trim().slice(0, 200) : user.name,
      description: typeof user.description === "string" ? user.description.slice(0, 1000) : "",
      createdAt: user.created_at ?? null,
      website: safeWebsite.success ? safeWebsite.data : null,
      followers: metrics?.followers_count ?? null,
      fetchedAt: now.toISOString(),
    });
    if (parsed.success && requested.has(parsed.data.id)) profiles.set(parsed.data.id, parsed.data);
  }
  const missing = new Set<string>();
  for (const row of response.errors ?? []) {
    if (!row || typeof row !== "object") continue;
    const error = row as Record<string, unknown>;
    const id = error.resource_id ?? error.value;
    if (
      error.type === "https://api.x.com/2/problems/resource-not-found" &&
      typeof id === "string" &&
      requested.has(id) &&
      !profiles.has(id)
    )
      missing.add(id);
  }
  return { profiles, missing };
}

/** Shared by author ID across tickers, analyses, and server instances. */
export class XProfileCache {
  constructor(private gateway: ExternalGateway) {}

  async getProfiles(authorIds: string[], allowLookup = false) {
    const ids = [...new Set(authorIds)].slice(0, 10);
    if (!ids.length) return { authors: [] };
    const env = getEnv();
    const prefix = `${dataMode()}:x:profile:v1:`;
    const lease = randomUUID();
    const lookupLimit = allowLookup ? env.X_PROFILE_LOOKUP_LIMIT : 0;
    // Claim a short lease before network I/O. Concurrent analyses must not pay for the same author.
    const claim = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${prefix}claims`}))`;
      const rows = await tx.providerCache.findMany({
        where: { key: { in: ids.map((id) => prefix + id) } },
      });
      const authors: SocialAuthor[] = [];
      const lookupIds: string[] = [];
      let cacheHits = 0;
      const now = new Date();
      for (const id of ids) {
        const row = rows.find((candidate) => candidate.key === prefix + id);
        const entry = entrySchema.safeParse(row?.value);
        if (row && row.expiresAt > now && entry.success) {
          if (entry.data.state === "available" && entry.data.profile.id === id) {
            authors.push(entry.data.profile);
            cacheHits++;
            continue;
          }
          if (entry.data.state !== "available") {
            if (entry.data.state !== "pending") cacheHits++;
            continue;
          }
        }
        if (lookupIds.length >= lookupLimit) continue;
        lookupIds.push(id);
        const value = jsonValue({ state: "pending", lease });
        const expiresAt = new Date(now.getTime() + LEASE_MS);
        await tx.providerCache.upsert({
          where: { key: prefix + id },
          create: { key: prefix + id, value, fetchedAt: now, expiresAt },
          update: { value, fetchedAt: now, expiresAt },
        });
      }
      return { authors, lookupIds, cacheHits };
    });
    if (claim.cacheHits)
      await this.gateway.record({
        provider: "x",
        operation: "profiles",
        cached: true,
        success: true,
        attempt: 0,
        durationMs: 0,
        estimatedCostUsd: 0,
      });
    if (claim.lookupIds.length) {
      let profiles = new Map<string, SocialAuthor>();
      let missing = new Set<string>();
      try {
        const url = new URL("https://api.x.com/2/users");
        url.searchParams.set("ids", claim.lookupIds.join(","));
        url.searchParams.set("user.fields", "created_at,description,entities,public_metrics,url");
        const raw = await this.gateway.request(
          "x",
          "profiles",
          url,
          { Authorization: `Bearer ${requireKey("X_BEARER_TOKEN")}` },
          {
            maxAttempts: 1,
            estimateCostUsd: (body) => {
              const parsed = responseSchema.safeParse(body);
              return parsed.success && (parsed.data.data || parsed.data.errors)
                ? (parsed.data.data?.length ?? 0) * env.X_PROFILE_READ_COST_USD
                : null;
            },
          },
        );
        ({ profiles, missing } = normalizeXProfiles(raw, claim.lookupIds));
      } catch {
        // Profile enrichment is optional. Keep the posts and cool down failed author lookups.
      }
      for (const id of claim.lookupIds) {
        const profile = profiles.get(id);
        const state = profile ? "available" : missing.has(id) ? "missing" : "unavailable";
        const now = new Date();
        const result = await db.providerCache.updateMany({
          where: { key: prefix + id, value: { path: ["lease"], equals: lease } },
          data: {
            value: jsonValue(profile ? { state, profile } : { state }),
            fetchedAt: now,
            expiresAt: new Date(
              now.getTime() +
                (profile
                  ? env.X_PROFILE_CACHE_DAYS * DAY_MS
                  : missing.has(id)
                    ? DAY_MS
                    : FAILURE_TTL_MS),
            ),
          },
        });
        if (profile && result.count) claim.authors.push(profile);
      }
    }
    const byId = new Map(claim.authors.map((author) => [author.id, author]));
    const authors = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    return {
      authors,
      ...(authors.length < ids.length
        ? {
            authorProfilesMessage: `Profiles available for ${authors.length} of ${ids.length} authors. ${allowLookup && lookupLimit ? `At most ${lookupLimit} new or expired profiles are requested per analysis; unavailable or pending profiles are skipped.` : "New profile lookups were disabled; only fresh cached profiles were reused."}`,
          }
        : {}),
    };
  }
}
