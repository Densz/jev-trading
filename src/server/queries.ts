import "server-only";
import { db } from "@/db/client";
import { dataMode, getEnv } from "./env";
import {
  quoteSchema,
  decisionSchema,
  analysisInputSchema,
  type MarketQuote,
  type AnalysisInput,
  type AnalysisDecision,
} from "@/types/analysis";
import { DemoMarketProvider } from "@/lib/demo/providers";
import type { Analysis } from "@/generated/prisma/client";

export type AnalysisView = AnalysisDecision & {
  id: string;
  createdAt: string;
  input: AnalysisInput;
  model: string;
  engine: string;
  raw: unknown;
  marketSnapshot: unknown;
};
export type TickerView = {
  symbol: string;
  name: string;
  exchange: string;
  enabled: boolean;
  quote: MarketQuote | null;
  latest: AnalysisView | null;
  run: { status: string; stage: string; startedAt: string; errorMessage: string | null } | null;
};
export function analysisView(row: Analysis): AnalysisView {
  return {
    ...decisionSchema.parse({
      decision: row.decision,
      confidence: row.confidence,
      summary: row.summary,
      bullishFactors: row.bullishFactors,
      bearishFactors: row.bearishFactors,
      risks: row.risks,
    }),
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    input: analysisInputSchema.parse(row.analysisInput),
    model: row.model,
    engine: row.engine,
    raw: row.engineOutput,
    marketSnapshot: row.marketDataSnapshot,
  };
}
export async function getWatchlist(): Promise<TickerView[]> {
  const mode = dataMode();
  const tickers = await db.ticker.findMany({
    orderBy: [{ enabled: "desc" }, { symbol: "asc" }],
    include: {
      analyses: { where: { dataMode: mode }, orderBy: { createdAt: "desc" }, take: 1 },
      runs: { where: { dataMode: mode }, orderBy: { startedAt: "desc" }, take: 1 },
    },
  });
  const cache = await db.providerCache.findMany({
    where: { key: { in: tickers.map((t) => `${mode}:quote:${t.symbol}`) } },
  });
  return Promise.all(
    tickers.map(async (t) => {
      const latest = t.analyses[0] ? analysisView(t.analyses[0]) : null;
      const cached = cache.find((c) => c.key === `${mode}:quote:${t.symbol}`);
      const cachedQuote = quoteSchema.safeParse(cached?.value);
      let quote = cachedQuote.success ? cachedQuote.data : (latest?.input.market ?? null);
      if (mode === "demo") {
        try {
          quote = await new DemoMarketProvider().getQuote(t.symbol);
        } catch {
          quote = null;
        }
      }
      const run = t.runs[0];
      return {
        symbol: t.symbol,
        name: t.name,
        exchange: t.exchange,
        enabled: t.enabled,
        quote,
        latest,
        run: run
          ? {
              status:
                run.status === "RUNNING" && run.expiresAt <= new Date()
                  ? "INTERRUPTED"
                  : run.status,
              stage: run.stage,
              startedAt: run.startedAt.toISOString(),
              errorMessage:
                run.status === "RUNNING" && run.expiresAt <= new Date()
                  ? "Previous run timed out. Retry the analysis."
                  : run.errorMessage,
            }
          : null,
      };
    }),
  );
}
export async function getTickerHistory(symbol: string) {
  const row = await db.ticker.findUnique({
    where: { symbol },
    include: {
      analyses: { where: { dataMode: dataMode() }, orderBy: { createdAt: "desc" }, take: 100 },
      runs: { where: { dataMode: dataMode() }, orderBy: { startedAt: "desc" }, take: 10 },
    },
  });
  if (!row) return null;
  const cached = await db.providerCache.findUnique({
    where: { key: `${dataMode()}:quote:${symbol}` },
  });
  const parsedQuote = quoteSchema.safeParse(cached?.value);
  let currentQuote = parsedQuote.success
    ? parsedQuote.data
    : row.analyses[0]
      ? analysisInputSchema.parse(row.analyses[0].analysisInput).market
      : null;
  if (getEnv().DEMO_MODE) {
    try {
      currentQuote = await new DemoMarketProvider().getQuote(symbol);
    } catch {
      currentQuote = null;
    }
  }
  return row
    ? {
        ticker: {
          symbol: row.symbol,
          name: row.name,
          exchange: row.exchange,
          enabled: row.enabled,
        },
        analyses: row.analyses.map(analysisView),
        quote: currentQuote,
        runs: row.runs.map((r) => ({
          id: r.id,
          status: r.status === "RUNNING" && r.expiresAt <= new Date() ? "INTERRUPTED" : r.status,
          stage: r.stage,
          startedAt: r.startedAt.toISOString(),
          errorMessage: r.errorMessage,
          errorCode: r.errorCode,
          warnings: r.warnings,
        })),
      }
    : null;
}
export async function getRecentAnalyses() {
  return (
    await db.analysis.findMany({
      where: { dataMode: dataMode() },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { ticker: { select: { symbol: true, name: true } } },
    })
  ).map((a) => ({ ...analysisView(a), symbol: a.ticker.symbol, name: a.ticker.name }));
}
export async function getUsage() {
  const now = new Date();
  const day = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await db.apiUsage.findMany({
    where: { dataMode: dataMode(), createdAt: { gte: month } },
    orderBy: { createdAt: "desc" },
  });
  const sum = (records: typeof rows) =>
    records.reduce((total, r) => total + (r.estimatedCostUsd ?? 0), 0);
  const byTicker = new Map<
    string,
    {
      symbol: string;
      requests: number;
      cached: number;
      failures: number;
      inputTokens: number;
      cost: number;
    }
  >();
  for (const row of rows) {
    const current = byTicker.get(row.symbol) ?? {
      symbol: row.symbol,
      requests: 0,
      cached: 0,
      failures: 0,
      inputTokens: 0,
      cost: 0,
    };
    current.requests += row.cached ? 0 : 1;
    current.cached += row.cached ? 1 : 0;
    current.failures += row.success ? 0 : 1;
    current.inputTokens += row.inputTokens ?? 0;
    current.cost += row.estimatedCostUsd ?? 0;
    byTicker.set(row.symbol, current);
  }
  const count = await db.analysis.count({
    where: { dataMode: dataMode(), createdAt: { gte: month } },
  });
  return {
    todayCost: sum(rows.filter((r) => r.createdAt >= day)),
    monthCost: sum(rows),
    requests: rows.filter((r) => !r.cached).length,
    cacheHits: rows.filter((r) => r.cached).length,
    unknownCosts: rows.filter((r) => r.estimatedCostUsd == null).length,
    averageCost: count > 0 ? sum(rows) / count : null,
    analyses: count,
    byTicker: [...byTicker.values()],
    recent: rows.slice(0, 30).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  };
}
export function publicConfiguration() {
  const env = getEnv();
  return {
    demo: env.DEMO_MODE,
    horizon: env.INVESTMENT_HORIZON,
    xEnabled: env.DEMO_MODE || !!env.X_BEARER_TOKEN,
    defaultTweetLimit: env.X_DEFAULT_TWEET_LIMIT,
    xPostReadCostUsd: env.X_POST_READ_COST_USD,
    xProfileReadCostUsd: env.X_PROFILE_READ_COST_USD,
    xProfileLookupLimit: env.X_PROFILE_LOOKUP_LIMIT,
    xProfileCacheDays: env.X_PROFILE_CACHE_DAYS,
    financialReportsEnabled:
      env.DEMO_MODE || /[^\s@]+@[^\s@]+\.[^\s@]+/.test(env.SEC_USER_AGENT ?? ""),
    missing: env.DEMO_MODE
      ? []
      : (["TWELVE_DATA_API_KEY", "FINNHUB_API_KEY", "TYPESAFE_API_KEY"] as const).filter(
          (key) => !env[key],
        ),
  };
}
