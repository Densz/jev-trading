import "server-only";
import type {
  AnalysisInput,
  DecisionEngine,
  MarketDataProvider,
  NewsProvider,
  TradingDecision,
} from "@/types/analysis";
import { AppError } from "@/lib/errors";
import type { FinancialReportsProvider } from "@/types/financials";
import { normalizeCompanyFacts } from "@/lib/financials/normalize";
import { MAX_SOCIAL_CONTEXT_POSTS, tweetLimitSchema, type SocialProvider } from "@/types/social";
import { getEnv } from "@/server/env";

export const demoCompanies: Record<
  string,
  { name: string; price: number; change: number; decision: TradingDecision; confidence: number }
> = {
  AAPL: { name: "Apple Inc.", price: 245.32, change: 1.24, decision: "BUY", confidence: 0.82 },
  NVDA: {
    name: "NVIDIA Corporation",
    price: 192.48,
    change: -0.63,
    decision: "HOLD",
    confidence: 0.64,
  },
  MSFT: {
    name: "Microsoft Corporation",
    price: 518.76,
    change: 0.86,
    decision: "BUY",
    confidence: 0.88,
  },
  GOOGL: { name: "Alphabet Inc.", price: 212.15, change: 1.72, decision: "HOLD", confidence: 0.71 },
  AMZN: {
    name: "Amazon.com, Inc.",
    price: 238.64,
    change: 0.42,
    decision: "BUY",
    confidence: 0.76,
  },
  TSLA: { name: "Tesla, Inc.", price: 410.23, change: -2.18, decision: "SELL", confidence: 0.78 },
};
function company(symbol: string) {
  const value = demoCompanies[symbol];
  if (!value)
    throw new AppError(
      "UNKNOWN_TICKER",
      "The synthetic workspace supports AAPL, NVDA, MSFT, GOOGL, AMZN, and TSLA.",
      404,
    );
  return value;
}
export class DemoMarketProvider implements MarketDataProvider {
  async getQuote(symbol: string) {
    const value = company(symbol);
    return {
      symbol,
      name: value.name,
      exchange: "NASDAQ",
      currency: "USD",
      price: value.price,
      change: (value.price * value.change) / 100,
      changePercent: value.change,
      volume: 48210000,
      averageVolume: 43120000,
      fiftyTwoWeekHigh: value.price * 1.2,
      fiftyTwoWeekLow: value.price * 0.65,
      asOf: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      provider: "Synthetic demo",
    };
  }
  async getHistoricalData(symbol: string) {
    const value = company(symbol);
    const points = Array.from({ length: 90 }, (_, index) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - (89 - index));
      return {
        date: date.toISOString().slice(0, 10),
        close: Number(
          (value.price * (0.92 + index * 0.0009 + Math.sin(index * 0.9) * 0.008)).toFixed(2),
        ),
        volume: 40000000 + index * 120000,
      };
    }).filter((p) => ![0, 6].includes(new Date(p.date).getUTCDay()));
    return { symbol, provider: "Synthetic demo", fetchedAt: new Date().toISOString(), points };
  }
  async getFundamentals(symbol: string) {
    const value = company(symbol);
    return {
      provider: "Synthetic demo",
      fetchedAt: new Date().toISOString(),
      peRatio: 32.4,
      revenueGrowthPercent: value.decision === "SELL" ? -8.2 : 12.4,
      epsGrowthPercent: value.decision === "SELL" ? -14.8 : 18.6,
      netMarginPercent: 22.1,
    };
  }
}
export class DemoNewsProvider implements NewsProvider {
  async getNews(symbol: string) {
    const value = company(symbol);
    return [
      {
        title: `[Synthetic] ${value.name} reports ${value.decision === "SELL" ? "slower" : "stronger"} quarterly revenue growth`,
        source: "Demo research feed",
        publishedAt: new Date(Date.now() - 7200000).toISOString(),
        url: `https://example.com/${symbol.toLowerCase()}/earnings`,
        summary:
          "Synthetic sample article for exploring the dashboard. This is not a real financial report.",
      },
      {
        title: `[Synthetic] Analysts review ${value.name}'s valuation and outlook`,
        source: "Demo market brief",
        publishedAt: new Date(Date.now() - 18000000).toISOString(),
        url: `https://example.com/${symbol.toLowerCase()}/outlook`,
        summary: "Synthetic sample showing how source articles appear in the analysis context.",
      },
    ];
  }
}
export class DemoDecisionEngine implements DecisionEngine {
  async analyze(input: AnalysisInput) {
    const value = company(input.ticker.symbol);
    // These are fixed demonstration classifications, never model outputs.
    await new Promise((resolve) => setTimeout(resolve, 500));
    return {
      engine: "demo",
      model: "synthetic-fixture-v1",
      raw: { synthetic: true, ...value },
      decision: {
        decision: value.decision,
        confidence: value.confidence,
        summary:
          value.decision === "BUY"
            ? "Synthetic example: earnings and revenue momentum support the investment thesis, with valuation requiring continued attention."
            : value.decision === "SELL"
              ? "Synthetic example: weaker earnings and revenue trends suggest a deteriorating investment thesis and unfavorable risk/reward."
              : "Synthetic example: positive growth is balanced by valuation uncertainty. The evidence does not justify changing the current position.",
        bullishFactors: input.evidence.filter((f) => f.kind === "bullish").map((f) => f.text),
        bearishFactors: input.evidence.filter((f) => f.kind === "bearish").map((f) => f.text),
        risks: [
          "This recommendation and all its data are synthetic. Do not use them to make an investment decision.",
          "Valuation sensitivity and macroeconomic uncertainty remain relevant considerations in this sample.",
        ],
      },
    };
  }
}
export class DemoSocialProvider implements SocialProvider {
  readonly provider = "synthetic";
  async getPosts(
    symbol: string,
    companyName: string,
    limit: number,
    options?: { includeAuthorProfiles?: boolean },
  ) {
    tweetLimitSchema.parse(limit);
    company(symbol);
    const now = new Date();
    return {
      fetchedCount: limit,
      fetchedAt: now.toISOString(),
      posts: Array.from({ length: Math.min(limit, MAX_SOCIAL_CONTEXT_POSTS) }, (_, index) => ({
        id: String(9000000000000000n + BigInt(index)),
        authorId: String(8000000000000000n + BigInt(index)),
        text: `[Synthetic] $${symbol}: sample discussion ${index + 1} about ${companyName}'s earnings and outlook. This is a demonstration, not a real X post.`,
        publishedAt: new Date(now.getTime() - (index + 1) * 3600000).toISOString(),
        url: `https://x.com/i/web/status/${9000000000000000n + BigInt(index)}`,
        likes: 20 + index * 3,
        reposts: 5 + index,
      })),
      ...(options?.includeAuthorProfiles && limit > 0
        ? {
            authors: Array.from(
              { length: Math.min(limit, getEnv().X_PROFILE_LOOKUP_LIMIT) },
              (_, index) => ({
                id: String(8000000000000000n + BigInt(index)),
                username: `demo_author_${index + 1}`,
                name: `Synthetic author ${index + 1}`,
                description:
                  "Synthetic profile for demonstration. Identity and claims have not been verified.",
                createdAt: "2020-01-01T00:00:00.000Z",
                website: null,
                followers: 100 + index,
                fetchedAt: now.toISOString(),
              }),
            ),
          }
        : {}),
    };
  }
}
export class DemoFinancialReportsProvider implements FinancialReportsProvider {
  async getReports(symbol: string) {
    const value = company(symbol);
    const now = new Date();
    const anchor = new Date(
      Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3 - 3, 0),
    );
    const facts: Record<string, { units: Record<string, unknown[]> }> = {};
    const add = (
      concept: string,
      unit: string,
      start: string | undefined,
      end: string,
      amount: number,
      index: number,
      form: string,
    ) => {
      const key = `0000000000-26-${String(index + 1).padStart(6, "0")}`;
      const filed = new Date(Date.parse(end) + 30 * 86400000).toISOString().slice(0, 10);
      const entry = (facts[concept] ??= { units: {} });
      (entry.units[unit] ??= []).push({ start, end, val: amount, accn: key, filed, form });
    };
    const emit = (start: string, end: string, revenue: number, index: number, form: string) => {
      for (const [concept, amount] of Object.entries({
        RevenueFromContractWithCustomerExcludingAssessedTax: revenue,
        GrossProfit: revenue * 0.55,
        OperatingIncomeLoss: revenue * 0.3,
        NetIncomeLoss: revenue * 0.22,
        NetCashProvidedByUsedInOperatingActivities: revenue * 0.25,
        PaymentsToAcquirePropertyPlantAndEquipment: revenue * 0.04,
      }))
        add(concept, "USD", start, end, amount, index, form);
      add("EarningsPerShareDiluted", "USD/shares", start, end, revenue / 1e10, index, form);
      add(
        "CashAndCashEquivalentsAtCarryingValue",
        "USD",
        undefined,
        end,
        revenue * 1.4,
        index,
        form,
      );
    };
    for (let index = 0; index < 12; index++) {
      const end = new Date(
        Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1 - index * 3, 0),
      );
      const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 2, 1));
      emit(
        start.toISOString().slice(0, 10),
        end.toISOString().slice(0, 10),
        (25 - index * (value.decision === "SELL" ? -0.4 : 0.5)) * 1e9,
        index,
        "10-Q",
      );
    }
    for (let index = 0; index < 4; index++) {
      const year = now.getUTCFullYear() - 1 - index;
      emit(`${year}-01-01`, `${year}-12-31`, (96 - index * 8) * 1e9, index + 20, "10-K");
    }
    const reports = normalizeCompanyFacts(
      { cik: 0, facts: { "us-gaap": facts } },
      "0000000000",
      now,
    );
    reports.provider = "Synthetic demo";
    reports.sources = reports.sources.map((source) => ({
      ...source,
      url: `https://example.com/synthetic/${symbol}/${source.id}`,
    }));
    const sourceId = reports.sources[0].id;
    reports.excerpts = [
      {
        category: "outlook",
        sourceId,
        text: "[Synthetic] Management expects demand to remain resilient, while acknowledging that forecasts are uncertain. This is not an actual issuer statement.",
        truncated: false,
      },
      {
        category: "risks",
        sourceId,
        text: "[Synthetic] Export restrictions, customer concentration, and elevated investment commitments could affect future results. This is not a real filing.",
        truncated: false,
      },
    ];
    return reports;
  }
}
