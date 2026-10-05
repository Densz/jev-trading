import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { testDatabaseUrl } from "../../scripts/test-database";

process.env.DATABASE_URL = testDatabaseUrl();
process.env.DEMO_MODE = "false";
process.env.APP_PASSWORD = "integration-test-password-only";
process.env.API_KEY_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.TYPESAFE_API_KEY = "";
process.env.X_PROFILE_LOOKUP_LIMIT = "3";
const { db } = await import("../../src/db/client");
const { getAiSettings, getEngineConfiguration, saveProvider, setDefaultProvider, deleteProvider } =
  await import("../../src/server/ai-settings");
const { AiDecisionEngine } = await import("../../src/lib/ai/analyze");
const { ExternalGateway } = await import("../../src/server/external");
const { AnalysisPipeline } = await import("../../src/lib/analysis/pipeline");
const { PrismaAnalysisRepository } = await import("../../src/server/analysis-repository");
const { DemoMarketProvider, DemoNewsProvider, DemoFinancialReportsProvider, DemoSocialProvider } =
  await import("../../src/lib/demo/providers");
const { GET, PUT, POST } = await import("../../src/app/api/settings/ai/route");
const secret = "integration-ai-key-not-real";
let malformed = false;
let networkCalls = 0;
const ticker = await db.ticker.upsert({
  where: { symbol: "AAPL" },
  create: { symbol: "AAPL", name: "Apple", exchange: "NASDAQ" },
  update: { enabled: true },
});
const transport: typeof fetch = async (url, options) => {
  networkCalls++;
  const request = JSON.parse(String(options?.body));
  assert.ok(!String(options?.body).includes(secret));
  assert.equal(new Headers(options?.headers).get("authorization"), `Bearer ${secret}`);
  assert.equal(new URL(String(url)).hostname, "api.openai.com");
  const context = JSON.parse(request.messages[1].content);
  assert.equal(context.social.status, "available");
  assert.equal(context.social.posts.length, 10);
  if (networkCalls === 1) {
    assert.equal(context.social.requestedLimit, 20);
    assert.equal(context.social.authors.length, 3);
  }
  const decision = {
    decision: "HOLD",
    confidence: 0.6,
    summary: "Mixed evidence; review missing information before changing exposure.",
    bullishFactors: ["Revenue grew."],
    bearishFactors: [],
    risks: ["Incomplete outlook."],
  };
  return Response.json({
    model: `${request.model}-version`,
    choices: [
      {
        finish_reason: "stop",
        message: { content: malformed ? "invalid JSON" : JSON.stringify(decision) },
      },
    ],
    usage: { prompt_tokens: 200, completion_tokens: 80 },
  });
};
try {
  await db.analysis.deleteMany({ where: { tickerId: ticker.id, engine: "openai" } });
  await deleteProvider("openai");
  const firstSave = await PUT(
    new Request("http://localhost/api/settings/ai", {
      method: "PUT",
      body: JSON.stringify({ provider: "openai", model: "gpt-4.1-mini", apiKey: secret }),
    }),
  );
  assert.equal(firstSave.status, 200);
  assert.ok(!(await firstSave.text()).includes(secret));
  const saved = await db.aiProviderConfig.findUniqueOrThrow({ where: { provider: "openai" } });
  assert.ok(!saved.encryptedApiKey.includes(secret));
  assert.equal((await getEngineConfiguration("openai")).apiKey, secret);
  await saveProvider({ provider: "openai", model: "gpt-4.1" });
  assert.equal(
    (await db.aiProviderConfig.findUniqueOrThrow({ where: { provider: "openai" } }))
      .encryptedApiKey,
    saved.encryptedApiKey,
  );
  assert.ok(!JSON.stringify(await getAiSettings()).includes("encryptedApiKey"));
  assert.ok(!(await (await GET()).text()).includes(secret));
  await setDefaultProvider("openai");
  assert.equal((await getEngineConfiguration()).provider, "openai");
  const pipeline = async () => {
    const configuration = await getEngineConfiguration();
    return new AnalysisPipeline(
      new PrismaAnalysisRepository({ engine: configuration.provider, model: configuration.model }),
      (symbol, runId) => ({
        market: new DemoMarketProvider(),
        news: new DemoNewsProvider(),
        financials: new DemoFinancialReportsProvider(),
        social: new DemoSocialProvider(),
        engine: new AiDecisionEngine(new ExternalGateway(symbol, runId, transport), configuration),
      }),
      "medium-term",
    );
  };
  assert.equal(
    (
      await (
        await pipeline()
      ).analyzeTicker("AAPL", {
        tweetLimit: 20,
        includeAuthorProfiles: true,
      })
    ).status,
    "succeeded",
  );
  assert.equal((await (await pipeline()).analyzeTicker("AAPL")).status, "skipped");
  assert.equal(networkCalls, 1);
  await saveProvider({ provider: "openai", model: "gpt-4.1-mini" });
  assert.equal(
    (await (await pipeline()).analyzeTicker("AAPL")).status,
    "succeeded",
    "A different configured model must have its own daily deduplication scope",
  );
  malformed = true;
  assert.equal((await (await pipeline()).analyzeTicker("AAPL", { force: true })).status, "failed");
  const analyses = await db.analysis.findMany({ where: { tickerId: ticker.id, engine: "openai" } });
  assert.equal(analyses.length, 2, "Invalid outputs must not save a recommendation");
  assert.ok(analyses.every((row) => row.model.endsWith("-version") && row.requestedModel));
  assert.ok(!JSON.stringify(analyses).includes(secret));
  const usage = await db.apiUsage.findMany({
    where: { runId: { in: analyses.map((row) => row.runId) } },
  });
  assert.ok(usage.every((entry) => entry.inputTokens === 200 && entry.estimatedCostUsd === null));
  process.env.DEMO_MODE = "true";
  assert.equal(
    (
      await POST(
        new Request("http://localhost/api/settings/ai", {
          method: "POST",
          body: JSON.stringify({ provider: "openai" }),
        }),
      )
    ).status,
    400,
  );
  assert.equal(networkCalls, 3, "Demo connection tests cannot make external requests");
  process.env.APP_PASSWORD = "";
  await assert.rejects(
    saveProvider({ provider: "deepseek", model: "deepseek-chat", apiKey: secret }),
    /APP_PASSWORD/,
  );
  process.env.APP_PASSWORD = "integration-test-password-only";
  const replaced = "integration-replaced-key-not-real";
  await saveProvider({ provider: "openai", model: "gpt-4.1-mini", apiKey: replaced });
  assert.equal((await getEngineConfiguration()).apiKey, replaced);
  await deleteProvider("openai");
  assert.equal((await getAiSettings()).defaultProvider, "jev");
  assert.equal(await db.aiProviderConfig.findUnique({ where: { provider: "openai" } }), null);
  await assert.rejects(getEngineConfiguration("openai"), /Add an API key/);
  console.info(
    "AI integration passed: encrypted persistence, settings APIs, model selection, daily deduplication, billing metadata, invalid outputs, replacement and deletion.",
  );
} finally {
  await deleteProvider("openai");
  await db.$disconnect();
}
