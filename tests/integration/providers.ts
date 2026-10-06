import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { testDatabaseUrl } from "../../scripts/test-database";
import {
  companyFactsFixture,
  fixtureCik,
  filingHtmlFixture,
  submissionsFixture,
} from "../financial-fixtures";

process.env.DATABASE_URL = testDatabaseUrl();
process.env.DEMO_MODE = "false";
process.env.TYPESAFE_API_KEY = "integration-fixture-only";
process.env.TWELVE_DATA_API_KEY = "integration-fixture-only";
process.env.FINNHUB_API_KEY = "integration-fixture-only";
process.env.X_BEARER_TOKEN = "integration-fixture-only";
process.env.X_POST_READ_COST_USD = "0.005";
process.env.SEC_USER_AGENT = "Thesis integration contact@example.com";

const { db } = await import("../../src/db/client");
const { ExternalGateway } = await import("../../src/server/external");
const { TwelveDataMarketProvider } = await import("../../src/lib/market/twelve-data");
const { FinnhubNewsProvider } = await import("../../src/lib/news/finnhub");
const { XSocialProvider } = await import("../../src/lib/social/x");
const { SecFinancialReportsProvider } = await import("../../src/lib/financials/sec");
const { JevDecisionEngine } = await import("../../src/lib/jev/analyze");
const { AnalysisPipeline } = await import("../../src/lib/analysis/pipeline");
const { PrismaAnalysisRepository } = await import("../../src/server/analysis-repository");
const symbol = `TEST${randomBytes(3).toString("hex").toUpperCase()}`;
let mode: "success" | "engine-error" | "invalid-output" = "success";
let quoteAttempts = 0;
let networkCalls = 0;
let xCalls = 0;
let xStatus = 200;
const transport: typeof fetch = async (request, options) => {
  networkCalls++;
  const url = new URL(String(request));
  const now = new Date();
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  if (url.pathname === "/quote") {
    // Retryable status verifies bounded retries and per-attempt usage persistence.
    if (++quoteAttempts === 1) return json({ error: "fixture unavailable" }, 503);
    return json({
      symbol,
      name: "Integration Test Company",
      exchange: "NASDAQ",
      currency: "USD",
      close: "100",
      change: "1",
      percent_change: "1.01",
      timestamp: Math.floor(now.getTime() / 1000),
      volume: "1000000",
      average_volume: "900000",
    });
  }
  if (url.pathname === "/time_series")
    return json({
      meta: { symbol },
      values: Array.from({ length: 65 }, (_, i) => ({
        datetime: new Date(now.getTime() - (65 - i) * 86400000).toISOString().slice(0, 10),
        close: String(75 + i * 0.35),
        volume: "1000000",
      })),
    });
  if (url.pathname === "/api/v1/company-news")
    return json([
      {
        headline: "Company reports stronger earnings",
        source: "Fixture filings",
        datetime: Math.floor(now.getTime() / 1000) - 3600,
        url: "https://finnhub.io/api/news?id=earnings-fixture",
        related: symbol,
        summary: "Revenue improved from the previous year.",
      },
      {
        headline: "Regulator announces new export restrictions",
        source: "Fixture regulator",
        datetime: Math.floor(now.getTime() / 1000) - 7200,
        url: "https://finnhub.io/api/news?id=regulation-fixture",
        related: symbol,
        summary: "A new restriction affects the company's product shipments.",
      },
    ]);
  if (url.pathname === "/api/v1/stock/metric")
    return json({ symbol, metric: { peTTM: 25, epsGrowthTTMYoy: 12, revenueGrowthTTMYoy: 10 } });
  if (url.pathname === "/2/tweets/search/recent") {
    xCalls++;
    assert.equal(
      new Headers(options?.headers).get("Authorization"),
      "Bearer integration-fixture-only",
    );
    assert.equal(url.searchParams.get("max_results"), "10");
    assert.equal(url.searchParams.get("sort_order"), "relevancy");
    assert.equal(url.searchParams.get("tweet.fields"), "created_at,public_metrics,author_id");
    assert.equal(url.searchParams.has("expansions"), false);
    assert.equal(url.searchParams.has("next_token"), false);
    if (xStatus !== 200) return json({ errors: [{ detail: "fixture unavailable" }] }, xStatus);
    return json({
      data: Array.from({ length: 10 }, (_, index) => ({
        id: String(1000 + index),
        author_id: String(2000 + index),
        text: `$${symbol}: company earnings update ${index + 1}`,
        created_at: new Date(now.getTime() - 3600000).toISOString(),
        public_metrics: { like_count: index * 10, retweet_count: index },
      })),
      meta: { result_count: 10, next_token: "never-follow-this-page" },
    });
  }
  if (["www.sec.gov", "data.sec.gov"].includes(url.hostname)) {
    assert.equal(
      new Headers(options?.headers).get("User-Agent"),
      "Thesis integration contact@example.com",
    );
    if (url.pathname === "/files/company_tickers.json")
      return json({ "0": { cik_str: Number(fixtureCik), ticker: symbol } });
    if (url.pathname.startsWith("/api/xbrl/companyfacts/")) return json(companyFactsFixture());
    if (url.pathname.startsWith("/submissions/")) return json(submissionsFixture);
    if (url.pathname.endsWith("index.json"))
      return json({ directory: { item: [{ name: "ex99-1.htm" }] } });
    if (url.pathname.endsWith(".htm"))
      return new Response(filingHtmlFixture, { headers: { "Content-Type": "text/html" } });
  }
  if (url.pathname === "/v1/systemone") {
    assert.equal(
      new Headers(options?.headers).get("authorization"),
      "Bearer integration-fixture-only",
    );
    if (mode === "engine-error") return json({ detail: "Invalid API key fixture" }, 401);
    const body = JSON.parse(String(options?.body));
    const answers = Object.fromEntries(
      Object.entries(body.questions as Record<string, { criteria: Record<string, string> }>).map(
        ([key, question]) => {
          const selected =
            key === "recommendation" ? "HOLD" : key.startsWith("news_") ? "BULLISH" : "SUPPORTED";
          const names = Object.keys(question.criteria);
          const probabilities = Object.fromEntries(
            names.map((name) => [name, name === selected ? 0.8 : 0.2 / (names.length - 1)]),
          );
          return [
            key,
            {
              type: "choice",
              choice: selected,
              confidence: (0.8 - 1 / names.length) / (1 - 1 / names.length),
              probabilities,
            },
          ];
        },
      ),
    );
    if (mode === "invalid-output") delete answers.recommendation;
    return json({ model: "jev-1.13.0", answers, usage: { input_tokens: 1000, output_tokens: 50 } });
  }
  throw new Error(`Unexpected external endpoint: ${url.origin}${url.pathname}`);
};
try {
  // The fixture issuer index varies by run; invalidate only that fixture cache in the isolated test DB.
  await db.providerCache.deleteMany({ where: { key: "live:sec:tickers:v1" } });
  await db.ticker.create({
    data: { symbol, name: "Integration Test Company", exchange: "NASDAQ" },
  });
  const pipeline = new AnalysisPipeline(
    new PrismaAnalysisRepository(),
    (sym, runId) => {
      const gateway = new ExternalGateway(sym, runId, transport);
      return {
        market: new TwelveDataMarketProvider(gateway),
        news: new FinnhubNewsProvider(gateway),
        social: new XSocialProvider(gateway),
        financials: new SecFinancialReportsProvider(gateway),
        engine: new JevDecisionEngine(gateway),
      };
    },
    "medium-term",
  );
  const first = await pipeline.analyzeTicker(symbol);
  assert.equal(first.status, "succeeded");
  assert.equal(quoteAttempts, 2);
  assert.equal(xCalls, 1, "X must not follow the pagination token");
  const callsAfterFirst = networkCalls;
  const second = await pipeline.analyzeTicker(symbol, { force: true, tweetLimit: 100 });
  assert.equal(second.status, "succeeded");
  assert.equal(
    networkCalls - callsAfterFirst,
    1,
    "Only Jev should be called when provider caches are warm",
  );
  assert.equal(xCalls, 1, "Increasing the limit must reuse the same 24-hour X collection");
  mode = "engine-error";
  assert.equal((await pipeline.analyzeTicker(symbol, { force: true })).status, "failed");
  mode = "invalid-output";
  assert.equal((await pipeline.analyzeTicker(symbol, { force: true })).status, "failed");
  const saved = await db.analysis.findMany({ where: { ticker: { symbol } } });
  assert.equal(saved.length, 2, "Failed engine calls must never save a recommendation");
  const snapshotInput = saved[0].analysisInput as {
    version: string;
    financialReports: { quarterly: unknown[]; annual: unknown[]; excerpts: unknown[] };
    dataQuality: { status: string };
    news: { url: string }[];
    social: { requestedLimit: number; fetchedCount: number; posts: unknown[] };
  };
  assert.equal(snapshotInput.version, "2");
  assert.equal(snapshotInput.social.fetchedCount, 10);
  assert.equal(snapshotInput.social.posts.length, 10);
  assert.deepEqual(
    saved
      .map((analysis) => (analysis.analysisInput as typeof snapshotInput).social.requestedLimit)
      .sort((a, b) => a - b),
    [10, 100],
  );
  assert.equal(snapshotInput.financialReports.quarterly.length, 8);
  assert.equal(snapshotInput.financialReports.annual.length, 3);
  assert.ok(snapshotInput.financialReports.excerpts.length > 0);
  assert.equal(
    snapshotInput.news.filter((article) =>
      article.url.startsWith("https://finnhub.io/api/news?id="),
    ).length,
    2,
    "Distinct Finnhub article IDs must survive the full pipeline",
  );
  assert.ok(Math.abs(saved[0].confidence - 0.7) < 1e-12);
  const snapshot = saved[0].marketDataSnapshot as { history: { points: unknown[] } };
  assert.equal(
    snapshot.history.points.length,
    65,
    "Source bars should be retained for indicator auditing",
  );
  assert.ok(
    !JSON.stringify(saved[0].analysisInput).includes("integration-fixture-only"),
    "API keys must never enter the normalized context",
  );
  assert.ok(
    !JSON.stringify(saved[0].analysisInput).includes("contact@example.com"),
    "The SEC contact remains server-side",
  );
  const runs = await db.analysisRun.findMany({
    where: { ticker: { symbol } },
    orderBy: { startedAt: "asc" },
  });
  assert.deepEqual(
    runs.map((r) => r.status),
    ["SUCCEEDED", "SUCCEEDED", "FAILED", "FAILED"],
  );
  assert.equal(runs[3].errorCode, "MALFORMED_RESPONSE");
  assert.ok(runs[3].rawOutput, "Malformed engine output should remain inspectable");
  const usage = await db.apiUsage.findMany({ where: { symbol } });
  assert.equal(usage.filter((u) => u.cached).length, 18);
  assert.equal(usage.filter((u) => u.provider === "x" && !u.cached).length, 1);
  assert.equal(usage.find((u) => u.provider === "x" && !u.cached)?.estimatedCostUsd, 0.05);
  assert.equal(usage.filter((u) => u.provider === "jev" && u.inputTokens === 1000).length, 3);
  assert.ok(usage.some((u) => u.provider === "twelvedata" && !u.success && u.attempt === 1));
  assert.ok(
    usage.some(
      (u) =>
        u.provider === "jev" &&
        u.estimatedCostUsd !== null &&
        Math.abs(u.estimatedCostUsd - 0.000042) < 1e-12,
    ),
  );
  // Verify opt-out and failures against the real gateway, without reaching an external service.
  await db.providerCache.deleteMany({ where: { key: `live:x:posts:v1:${symbol}` } });
  const xProvider = new XSocialProvider(new ExternalGateway(symbol, undefined, transport));
  const xCallsBeforeDisabled = xCalls;
  await xProvider.getPosts(symbol, "Integration Test Company", 0);
  assert.equal(xCalls, xCallsBeforeDisabled, "Disabling X must make no network request");
  xStatus = 503;
  await assert.rejects(() => xProvider.getPosts(symbol, "Integration Test Company", 10));
  assert.equal(xCalls - xCallsBeforeDisabled, 1, "X failures must not trigger automatic retries");
  const xFailure = await db.apiUsage.findFirst({
    where: { symbol, provider: "x", success: false },
  });
  assert.equal(xFailure?.attempt, 1);
  assert.equal(
    xFailure?.estimatedCostUsd,
    null,
    "Unknown failed-request billing must not be recorded as free",
  );
  const { runXProfileIntegration } = await import("./x-profiles");
  await runXProfileIntegration(symbol);
  console.info(
    "Provider integration passed: actual SDK serialization, PostgreSQL cache/rate limits, retries, usage billing, and failed-output persistence.",
  );
} finally {
  await db.$disconnect();
}
