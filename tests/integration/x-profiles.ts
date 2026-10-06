import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { db } from "../../src/db/client";
import { ExternalGateway } from "../../src/server/external";
import { XProfileCache } from "../../src/lib/social/profiles";
import { XSocialProvider } from "../../src/lib/social/x";

export async function runXProfileIntegration(symbol: string) {
  process.env.X_PROFILE_LOOKUP_LIMIT = "3";
  process.env.X_PROFILE_CACHE_DAYS = "30";
  process.env.X_PROFILE_READ_COST_USD = "0.01";
  const base = BigInt(`0x${randomBytes(7).toString("hex")}`);
  const ids = Array.from({ length: 10 }, (_, index) => String(base + BigInt(index)));
  const prefix = "live:x:profile:v1:";
  const profileSymbol = `${symbol}_profiles`;
  let calls = 0;
  let searchCalls = 0;
  let lastIds: string[] = [];
  let state: "success" | "missing" | "failure" | "incomplete" = "success";
  let blockedId: string | undefined;
  let onEntered: (() => void) | undefined;
  let blocked: Promise<void> | undefined;
  const transport: typeof fetch = async (request, options) => {
    const url = new URL(String(request));
    assert.equal(
      new Headers(options?.headers).get("Authorization"),
      "Bearer integration-fixture-only",
    );
    if (url.pathname === "/2/tweets/search/recent") {
      searchCalls++;
      return Response.json({
        data: ids.slice(0, 4).map((id, index) => ({
          id: String(base + 100n + BigInt(index)),
          author_id: id,
          text: `Company earnings report ${index}`,
          created_at: new Date().toISOString(),
        })),
      });
    }
    assert.equal(url.pathname, "/2/users");
    calls++;
    const callNumber = calls;
    const requestedIds = url.searchParams.get("ids")!.split(",");
    lastIds = requestedIds;
    assert.ok(
      requestedIds.length <= 3,
      "A profile batch must respect the configured new-author cap",
    );
    assert.equal(
      url.searchParams.get("user.fields"),
      "created_at,description,entities,public_metrics,url",
    );
    assert.equal(url.searchParams.has("expansions"), false);
    if (requestedIds.includes(blockedId ?? "")) {
      onEntered?.();
      await blocked;
    }
    if (state === "failure")
      return Response.json({ errors: [{ detail: "fixture unavailable" }] }, { status: 503 });
    if (state === "missing")
      return Response.json({
        errors: requestedIds.map((id) => ({
          type: "https://api.x.com/2/problems/resource-not-found",
          resource_id: id,
        })),
      });
    if (state === "incomplete")
      return Response.json({ data: [{ id: requestedIds[0], username: "invalid username" }] });
    return Response.json({
      data: requestedIds.map((id) => ({
        id,
        username: "fixture_author",
        name: `Fixture author ${callNumber}`,
        description: "Self-reported analyst biography",
        created_at: "2020-01-01T00:00:00Z",
        public_metrics: { followers_count: 100 },
      })),
    });
  };
  const gateway = new ExternalGateway(profileSymbol, undefined, transport);
  const cache = new XProfileCache(gateway);
  try {
    assert.deepEqual((await cache.getProfiles(ids.slice(0, 4))).authors, []);
    assert.equal(calls, 0, "Unselected author lookups must not make paid calls");
    const first = await cache.getProfiles([ids[0], ids[0], ...ids.slice(1, 4)], true);
    assert.equal(calls, 1);
    assert.deepEqual(lastIds, ids.slice(0, 3));
    assert.deepEqual(
      first.authors.map((author) => author.id),
      ids.slice(0, 3),
    );
    const stored = await db.providerCache.findUniqueOrThrow({ where: { key: prefix + ids[0] } });
    assert.ok(stored.expiresAt.getTime() - stored.fetchedAt.getTime() >= 30 * 86400000 - 1000);
    const otherTicker = new XProfileCache(
      new ExternalGateway(`${profileSymbol}_other`, undefined, transport),
    );
    const reused = await otherTicker.getProfiles(ids.slice(0, 3).reverse());
    assert.equal(calls, 1, "Profiles must be shared by ID across tickers and provider instances");
    assert.deepEqual(reused.authors, [...first.authors].reverse());

    await db.providerCache.update({
      where: { key: prefix + ids[0] },
      data: { expiresAt: new Date(0) },
    });
    const refreshed = await cache.getProfiles(ids.slice(0, 2), true);
    assert.equal(calls, 2);
    assert.deepEqual(lastIds, [ids[0]], "Only expired profiles should be fetched");
    assert.equal(refreshed.authors[0].name, "Fixture author 2");
    assert.deepEqual(refreshed.authors[1], first.authors[1]);
    assert.equal(
      first.authors[0].name,
      "Fixture author 1",
      "Earlier snapshots must remain unchanged",
    );

    state = "missing";
    await cache.getProfiles([ids[4]], true);
    const missingCalls = calls;
    await otherTicker.getProfiles([ids[4]], true);
    assert.equal(calls, missingCalls, "Missing users must not be requested repeatedly");
    const missing = await db.providerCache.findUniqueOrThrow({ where: { key: prefix + ids[4] } });
    assert.deepEqual(missing.value, { state: "missing" });
    assert.equal(missing.expiresAt.getTime() - missing.fetchedAt.getTime(), 86400000);

    state = "failure";
    const failedCalls = calls;
    await cache.getProfiles([ids[5]], true);
    await otherTicker.getProfiles([ids[5]], true);
    assert.equal(
      calls,
      failedCalls + 1,
      "Profile failures must cool down without automatic retries",
    );
    const failure = await db.apiUsage.findFirst({
      where: { symbol: profileSymbol, operation: "profiles", success: false },
    });
    assert.equal(failure?.estimatedCostUsd, null);
    const unavailable = await db.providerCache.findUniqueOrThrow({
      where: { key: prefix + ids[5] },
    });
    assert.equal(unavailable.expiresAt.getTime() - unavailable.fetchedAt.getTime(), 300000);
    state = "success";
    await db.providerCache.update({
      where: { key: prefix + ids[5] },
      data: { expiresAt: new Date(0) },
    });
    assert.equal((await cache.getProfiles([ids[5]], true)).authors.length, 1);

    state = "incomplete";
    await cache.getProfiles([ids[6]], true);
    const incomplete = await db.providerCache.findUniqueOrThrow({
      where: { key: prefix + ids[6] },
    });
    assert.deepEqual(
      incomplete.value,
      { state: "unavailable" },
      "Malformed data is not a permanent missing-account result",
    );
    state = "success";

    blockedId = ids[7];
    let release!: () => void;
    blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      onEntered = resolve;
    });
    const beforeConcurrent = calls;
    const pending = cache.getProfiles([ids[7]], true);
    try {
      await entered;
      const concurrent = await otherTicker.getProfiles([ids[7]], true);
      assert.deepEqual(concurrent.authors, []);
      assert.equal(
        calls,
        beforeConcurrent + 1,
        "Database leases must prevent duplicate paid lookups",
      );
    } finally {
      release();
    }
    const completed = await pending;
    assert.equal(completed.authors.length, 1);
    assert.deepEqual((await otherTicker.getProfiles([ids[7]])).authors, completed.authors);
    blockedId = undefined;

    await db.providerCache.create({
      data: {
        key: prefix + ids[8],
        value: { state: "pending", lease: "expired-lease" },
        expiresAt: new Date(0),
      },
    });
    assert.equal(
      (await cache.getProfiles([ids[8]], true)).authors.length,
      1,
      "Interrupted expired leases must be recoverable",
    );

    // A profile failure must preserve the independently cached post collection.
    process.env.X_PROFILE_LOOKUP_LIMIT = "0";
    const provider = new XSocialProvider(gateway);
    const withoutLookups = await provider.getPosts(profileSymbol, "Fixture Company", 10, {
      includeAuthorProfiles: true,
    });
    assert.equal(withoutLookups.authors?.length, 3);
    const callsBeforeEnrichment = calls;
    process.env.X_PROFILE_LOOKUP_LIMIT = "3";
    state = "failure";
    const withFailedEnrichment = await provider.getPosts(profileSymbol, "Fixture Company", 10, {
      includeAuthorProfiles: true,
    });
    assert.equal(
      searchCalls,
      1,
      "Profile enrichment must not refresh or bypass the 24-hour post cache",
    );
    assert.equal(calls, callsBeforeEnrichment + 1);
    assert.equal(withFailedEnrichment.posts.length, 4);
    assert.equal(withFailedEnrichment.authors?.length, 3);
    const withoutNewLookup = await provider.getPosts(profileSymbol, "Fixture Company", 10);
    assert.equal(calls, callsBeforeEnrichment + 1);
    assert.deepEqual(withoutNewLookup.authors, withFailedEnrichment.authors);
    const usage = await db.apiUsage.findMany({
      where: { symbol: profileSymbol, operation: "profiles" },
    });
    assert.ok(usage.some((row) => !row.cached && row.estimatedCostUsd === 0.03));
    assert.ok(usage.some((row) => row.cached && row.estimatedCostUsd === 0));
    console.info(
      "X profile integration passed: persistent shared cache, opt-in cap, TTL refresh, concurrency leases, missing-account cache, failure cooldown, and post preservation.",
    );
  } finally {
    await db.providerCache.deleteMany({
      where: { key: { in: [...ids.map((id) => prefix + id), `live:x:posts:v1:${profileSymbol}`] } },
    });
  }
}
