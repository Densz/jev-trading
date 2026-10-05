import type {
  AnalysisInputV2,
  EngineResult,
  MarketHistory,
  MarketQuote,
  NewsArticle,
} from "@/types/analysis";
import { buildAnalysisInput } from "@/lib/analysis/normalize";
export const now = new Date("2026-10-05T14:00:00Z");
export const quote: MarketQuote = {
  symbol: "AAPL",
  name: "Apple Inc.",
  exchange: "NASDAQ",
  currency: "USD",
  price: 100,
  change: 1,
  changePercent: 1.01,
  volume: 1000,
  averageVolume: 800,
  fiftyTwoWeekHigh: 120,
  fiftyTwoWeekLow: 70,
  asOf: now.toISOString(),
  fetchedAt: now.toISOString(),
  provider: "fixture",
};
export const history: MarketHistory = {
  symbol: "AAPL",
  provider: "fixture",
  fetchedAt: now.toISOString(),
  points: Array.from({ length: 60 }, (_, i) => ({
    date: new Date(now.getTime() - (60 - i) * 86400000).toISOString().slice(0, 10),
    close: 70 + i * 0.5,
    volume: 1000,
  })),
};
export const article: NewsArticle = {
  title: "Apple reports stronger quarterly earnings and revenue",
  source: "Company filing",
  publishedAt: "2026-10-04T12:00:00Z",
  url: "https://example.com/earnings",
  summary: "Revenue increased year over year.",
};
export function input(overrides: Partial<AnalysisInputV2> = {}): AnalysisInputV2 {
  return {
    ...buildAnalysisInput({
      quote,
      history,
      fundamentals: null,
      news: [article],
      warnings: [],
      horizon: "medium-term",
      now,
    }),
    ...overrides,
  };
}
export const validOutput: EngineResult = {
  engine: "test",
  model: "fixture-v1",
  raw: { fixture: true },
  decision: {
    decision: "HOLD",
    confidence: 0.7,
    summary: "Insufficient evidence to change the thesis.",
    bullishFactors: [],
    bearishFactors: [],
    risks: ["Forward estimates unavailable."],
  },
};
