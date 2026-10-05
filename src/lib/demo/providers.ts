import "server-only";
import type {
  AnalysisInput,
  DecisionEngine,
  MarketDataProvider,
  NewsProvider,
  TradingDecision,
} from "@/types/analysis";
import { AppError } from "@/lib/errors";

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
