import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { testDatabaseUrl } from "../../scripts/test-database";
import { validOutput } from "../fixtures";

process.env.DATABASE_URL = testDatabaseUrl();
process.env.DEMO_MODE = "false";
process.env.API_KEY_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.TWELVE_DATA_API_KEY = "deepseek-market-fixture-only";
process.env.FINNHUB_API_KEY = "deepseek-news-fixture-only";
process.env.TWELVE_DATA_CREDITS_PER_MINUTE = "10000";
process.env.SEC_USER_AGENT = "";
process.env.X_BEARER_TOKEN = "";

const { db } = await import("../../src/db/client");
const { saveProvider, deleteProvider } = await import("../../src/server/ai-settings");
const { POST: analyze } = await import("../../src/app/api/tickers/[symbol]/analyze/route");
const { POST: testConnection } = await import("../../src/app/api/settings/ai/route");
const symbol = `DS${randomBytes(3).toString("hex").toUpperCase()}`;
const secret = "deepseek-api-fixture-not-a-real-key";
const reasoning = "Fixture reasoning must never be saved as a final decision.";
let limitReached = false;
let decisionCalls = 0;
let connectionCalls = 0;
let outputLimit = 0;
const originalFetch = globalThis.fetch;
const ticker = await db.ticker.create({
  data: { symbol, name: "DeepSeek reasoning fixture", exchange: "NASDAQ" },
});
globalThis.fetch = async (request, options) => {
  const url = new URL(String(request));
  const now = new Date();
  if (url.hostname === "api.deepseek.com" && url.pathname === "/chat/completions") {
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, "deepseek-reasoner");
    assert.equal(new Headers(options?.headers).get("authorization"), `Bearer ${secret}`);
    assert.equal(options?.redirect, "error");
    const isDecision = body.response_format?.type === "json_object";
    if (isDecision) decisionCalls++;
    else connectionCalls++;
    const requiredTokens = isDecision ? 6400 : 128;
    const truncated = limitReached || body.max_tokens < requiredTokens;
    outputLimit = body.max_tokens;
    return Response.json({
      model: "deepseek-reasoner-fixture-version",
      choices: [
        {
          finish_reason: truncated ? "length" : "stop",
          message: {
            content: truncated ? "" : isDecision ? JSON.stringify(validOutput.decision) : "OK",
            reasoning_content: reasoning,
          },
        },
      ],
      usage: {
        prompt_tokens: isDecision ? 14819 : 10,
        completion_tokens: truncated ? body.max_tokens : requiredTokens,
      },
    });
  }
  if (url.hostname === "api.twelvedata.com" && url.pathname === "/quote")
    return Response.json({
      symbol,
      name: "DeepSeek reasoning fixture",
      exchange: "NASDAQ",
      currency: "USD",
      close: "100",
      change: "1",
      percent_change: "1.01",
      timestamp: Math.floor(now.getTime() / 1000),
      volume: "1000000",
      average_volume: "900000",
    });
  if (url.hostname === "api.twelvedata.com" && url.pathname === "/time_series")
    return Response.json({
      meta: { symbol },
      values: Array.from({ length: 65 }, (_, index) => ({
        datetime: new Date(now.getTime() - (65 - index) * 86400000).toISOString().slice(0, 10),
        close: String(75 + index * 0.35),
        volume: "1000000",
      })),
    });
  if (url.hostname === "finnhub.io" && url.pathname === "/api/v1/company-news")
    return Response.json([
      {
        headline: "Company reports earnings",
        source: "Research fixture",
        datetime: Math.floor(now.getTime() / 1000) - 3600,
        url: "https://example.com/earnings-fixture",
        related: symbol,
        summary: "Revenue improved year over year.",
      },
    ]);
  if (url.hostname === "finnhub.io" && url.pathname === "/api/v1/stock/metric")
    return Response.json({
      symbol,
      metric: { peTTM: 25, epsGrowthTTMYoy: 12, revenueGrowthTTMYoy: 10 },
    });
  throw new Error("Unexpected external request in DeepSeek fixture.");
};
try {
  await saveProvider({ provider: "deepseek", model: "deepseek-reasoner", apiKey: secret });
  const request = () =>
    analyze(
      new Request(`http://localhost/api/tickers/${symbol}/analyze`, {
        method: "POST",
        body: JSON.stringify({ provider: "deepseek", force: true, tweetLimit: 0 }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ symbol }) },
    );
  const successful = await request();
  assert.equal(
    successful.status,
    200,
    "The analysis must leave room for reasoning before the final JSON.",
  );
  const result = await successful.json();
  assert.equal(result.status, "succeeded");
  assert.equal(decisionCalls, 1, "A successful analysis must use one paid-model request.");
  const saved = await db.analysis.findUniqueOrThrow({ where: { id: result.analysisId } });
  assert.equal(saved.engine, "deepseek");
  assert.equal(saved.requestedModel, "deepseek-reasoner");
  assert.ok(!JSON.stringify(saved).includes(reasoning));
  assert.ok(!JSON.stringify(saved).includes(secret));

  const connection = await testConnection(
    new Request("http://localhost/api/settings/ai", {
      method: "POST",
      body: JSON.stringify({ provider: "deepseek" }),
    }),
  );
  assert.equal(
    connection.status,
    200,
    "Connection tests also need room for reasoning and must not enable JSON mode.",
  );
  assert.equal(connectionCalls, 1);

  limitReached = true;
  const failed = await request();
  assert.equal(failed.status, 502);
  const failure = await failed.json();
  assert.match(failure.message, /output limit/);
  assert.equal(decisionCalls, 2, "A truncated response must not trigger a billed retry.");
  assert.equal(await db.analysis.count({ where: { tickerId: ticker.id } }), 1);
  const failedRun = await db.analysisRun.findFirstOrThrow({
    where: { tickerId: ticker.id, status: "FAILED" },
  });
  assert.equal(failedRun.errorCode, "OUTPUT_LIMIT");
  assert.equal(failedRun.rawOutput, null);
  const usage = await db.apiUsage.findFirstOrThrow({
    where: { runId: failedRun.id, provider: "deepseek" },
  });
  assert.equal(usage.inputTokens, 14819);
  assert.equal(usage.outputTokens, outputLimit);
  assert.equal(usage.success, false);
  assert.equal(usage.errorCode, "OUTPUT_LIMIT");
  console.info(
    "DeepSeek route integration passed: reasoning budgets, connection test, truncation diagnostics, billing and single-request behavior.",
  );
} finally {
  globalThis.fetch = originalFetch;
  await deleteProvider("deepseek");
  await db.apiUsage.deleteMany({ where: { symbol } });
  await db.analysis.deleteMany({ where: { tickerId: ticker.id } });
  await db.analysisRun.deleteMany({ where: { tickerId: ticker.id } });
  await db.ticker.delete({ where: { id: ticker.id } });
  await db.providerCache.deleteMany({
    where: {
      key: {
        in: [
          `live:quote:${symbol}`,
          `live:history:${symbol}:3mo`,
          `live:news:v2:${symbol}`,
          `live:fundamentals:${symbol}`,
        ],
      },
    },
  });
  await db.$disconnect();
}
