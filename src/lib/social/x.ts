import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { ExternalGateway } from "@/server/external";
import { getEnv, requireKey } from "@/server/env";
import { XProfileCache } from "./profiles";
import {
  MAX_SOCIAL_CONTEXT_POSTS,
  socialPostSchema,
  tweetLimitSchema,
  type SocialCollection,
  type SocialPost,
  type SocialProvider,
} from "@/types/social";

const responseSchema = z.object({
  data: z.array(z.unknown()).max(100).optional(),
  meta: z.object({ result_count: z.number().int().nonnegative() }).optional(),
});

export function buildXQuery(symbol: string, companyName: string) {
  const name = companyName
    .replace(/\b(incorporated|inc|corporation|corp|limited|ltd)\.?\s*$/i, "")
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  const company = name ? `($${symbol} OR "${name}")` : `$${symbol}`;
  return `${company} (earnings OR revenue OR guidance OR outlook OR acquisition OR regulation OR launch) lang:en -is:retweet -is:reply`;
}

export function normalizeXPosts(raw: unknown, now = new Date()): SocialCollection {
  const response = responseSchema.parse(raw);
  if (!response.data && response.meta?.result_count !== 0)
    throw new AppError("MALFORMED_RESPONSE", "X returned no usable search results.");
  const rows = response.data ?? [];
  const posts: SocialPost[] = [];
  const ids = new Set<string>();
  const texts = new Set<string>();
  const authors = new Map<string, number>();
  // Preserve X's relevance order. Engagement alone is not evidence of reliability.
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const post = row as Record<string, unknown>;
    const metrics = post.public_metrics as Record<string, unknown> | undefined;
    const parsed = socialPostSchema.safeParse({
      id: post.id,
      authorId: post.author_id ?? null,
      text: typeof post.text === "string" ? post.text.trim().slice(0, 1000) : post.text,
      publishedAt: post.created_at,
      url: `https://x.com/i/web/status/${post.id}`,
      likes: metrics?.like_count ?? null,
      reposts: metrics?.retweet_count ?? null,
    });
    if (!parsed.success) continue;
    const value = parsed.data;
    const age = now.getTime() - Date.parse(value.publishedAt);
    if (age < 0 || age > 7 * 86400000 || ids.has(value.id)) continue;
    const fingerprint = value.text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (texts.has(fingerprint)) continue;
    if (value.authorId && (authors.get(value.authorId) ?? 0) >= 2) continue;
    ids.add(value.id);
    texts.add(fingerprint);
    if (value.authorId) authors.set(value.authorId, (authors.get(value.authorId) ?? 0) + 1);
    posts.push(value);
    if (posts.length === MAX_SOCIAL_CONTEXT_POSTS) break;
  }
  if (rows.length && !posts.length)
    throw new AppError("MALFORMED_RESPONSE", "X returned no valid recent posts.");
  return { fetchedCount: rows.length, fetchedAt: now.toISOString(), posts };
}

export class XSocialProvider implements SocialProvider {
  readonly provider = "x";
  constructor(private gateway: ExternalGateway) {}
  async getPosts(
    symbol: string,
    companyName: string,
    limit: number,
    options?: { includeAuthorProfiles?: boolean },
  ): Promise<SocialCollection> {
    tweetLimitSchema.parse(limit);
    if (limit === 0) return { fetchedCount: 0, fetchedAt: null, posts: [] };
    const token = requireKey("X_BEARER_TOKEN");
    // A changed limit never bypasses the shared 24-hour cache or triggers a top-up request.
    const collection = await this.gateway.cached(
      `x:posts:v1:${symbol}`,
      24 * 60 * 60000,
      "x",
      "search",
      async () => {
        const url = new URL("https://api.x.com/2/tweets/search/recent");
        url.searchParams.set("query", buildXQuery(symbol, companyName));
        url.searchParams.set("max_results", String(limit));
        url.searchParams.set("sort_order", "relevancy");
        // No expansions: extra user/media resources can carry separate read charges.
        url.searchParams.set("tweet.fields", "created_at,public_metrics,author_id");
        const raw = await this.gateway.request(
          "x",
          "search",
          url,
          { Authorization: `Bearer ${token}` },
          {
            maxAttempts: 1,
            estimateCostUsd: (body) => {
              const response = responseSchema.safeParse(body);
              if (
                !response.success ||
                (!response.data.data && response.data.meta?.result_count !== 0)
              )
                return null;
              return (response.data.data?.length ?? 0) * getEnv().X_POST_READ_COST_USD;
            },
          },
        );
        return normalizeXPosts(raw);
      },
    );
    try {
      const profiles = await new XProfileCache(this.gateway).getProfiles(
        collection.posts.flatMap((post) => (post.authorId ? [post.authorId] : [])),
        options?.includeAuthorProfiles,
      );
      return { ...collection, ...profiles };
    } catch {
      return {
        ...collection,
        authorProfilesMessage: "Author profiles could not be loaded. Posts remain unverified.",
      };
    }
  }
}
