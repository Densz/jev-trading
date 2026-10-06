import { z } from "zod";
import { dataQualitySchema, financialReportsSchema } from "./financials";
import { socialContextSchema } from "./social";

export const symbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9.-]{0,9}$/, "Enter a valid stock symbol, for example AAPL or BRK.B.");
const finite = z.number().finite();
export const quoteSchema = z.object({
  symbol: symbolSchema,
  name: z.string().min(1).max(200),
  exchange: z.string().min(1).max(80),
  currency: z.string().length(3),
  price: finite.positive(),
  change: finite,
  changePercent: finite,
  volume: finite.nonnegative().nullable(),
  averageVolume: finite.nonnegative().nullable(),
  fiftyTwoWeekHigh: finite.positive().nullable(),
  fiftyTwoWeekLow: finite.positive().nullable(),
  asOf: z.iso.datetime(),
  fetchedAt: z.iso.datetime(),
  provider: z.string(),
});
export const historySchema = z.object({
  symbol: symbolSchema,
  provider: z.string(),
  fetchedAt: z.iso.datetime(),
  points: z
    .array(
      z.object({
        date: z.iso.date(),
        close: finite.positive(),
        volume: finite.nonnegative().nullable(),
      }),
    )
    .max(260),
});
export const fundamentalsSchema = z.object({
  provider: z.string(),
  fetchedAt: z.iso.datetime(),
  peRatio: finite.nullable(),
  epsGrowthPercent: finite.nullable(),
  revenueGrowthPercent: finite.nullable(),
  netMarginPercent: finite.nullable(),
});
export const newsSchema = z.object({
  title: z.string().min(1).max(300),
  source: z.string().min(1).max(100),
  publishedAt: z.iso.datetime(),
  url: z.url().refine((url) => /^https?:\/\//.test(url)),
  summary: z.string().max(1000).optional(),
  sourceType: z.enum(["media", "issuer-filing"]).optional(),
  relatedSources: z
    .array(z.object({ source: z.string().max(100), url: z.url() }))
    .max(4)
    .optional(),
});
const analysisBaseSchema = z.object({
  ticker: z.object({
    symbol: symbolSchema,
    name: z.string().min(1).max(200),
    exchange: z.string().max(80),
  }),
  horizon: z.enum(["short-term", "medium-term", "long-term"]),
  asOf: z.iso.datetime(),
  market: quoteSchema,
  signals: z.object({
    weeklyChangePercent: finite.nullable(),
    monthlyChangePercent: finite.nullable(),
    movingAverage20: finite.nullable(),
    movingAverage50: finite.nullable(),
    annualizedVolatilityPercent: finite.nullable(),
    volumeRatio: finite.nullable(),
    volumeRatioBasis: z.enum(["completed-session", "unavailable"]).optional(),
    volumeRatioSessionDate: z.iso.date().nullable().optional(),
  }),
  fundamentals: fundamentalsSchema.nullable(),
  news: z.array(newsSchema).max(12),
  warnings: z.array(z.string().max(500)).max(20),
  evidence: z
    .array(
      z.object({
        id: z.string(),
        text: z.string().max(500),
        kind: z.enum(["bullish", "bearish", "risk"]),
        sourceRefs: z.array(z.string()).max(4).optional(),
      }),
    )
    .max(24),
});
export const newsEventSchema = z.object({
  id: z.string(),
  category: z.enum(["earnings", "guidance", "regulation", "business", "opinion", "other"]),
  title: z.string().max(300),
  reportedAt: z.iso.datetime(),
  sourceUrls: z.array(z.url()).max(5),
  evidenceType: z.enum(["publisher-summary", "issuer-statement"]),
});
export const analysisInputV2Schema = analysisBaseSchema.extend({
  version: z.literal("2"),
  rubricVersion: z.literal("thesis-v2"),
  financialReports: financialReportsSchema.nullable(),
  newsEvents: z.array(newsEventSchema).max(12),
  dataQuality: dataQualitySchema,
  social: socialContextSchema.optional(),
});
export const analysisInputSchema = z.discriminatedUnion("version", [
  analysisBaseSchema.extend({ version: z.literal("1"), rubricVersion: z.literal("thesis-v1") }),
  analysisInputV2Schema,
]);
export const decisionSchema = z
  .object({
    decision: z.enum(["BUY", "HOLD", "SELL"]),
    confidence: finite.min(0).max(1),
    summary: z.string().min(1).max(2000),
    bullishFactors: z.array(z.string().min(1).max(800)).max(12),
    bearishFactors: z.array(z.string().min(1).max(800)).max(12),
    risks: z.array(z.string().min(1).max(800)).max(12),
  })
  .strict();
export type TradingDecision = z.infer<typeof decisionSchema>["decision"];
export type MarketQuote = z.infer<typeof quoteSchema>;
export type MarketHistory = z.infer<typeof historySchema>;
export type Fundamentals = z.infer<typeof fundamentalsSchema>;
export type NewsArticle = z.infer<typeof newsSchema>;
export type AnalysisInput = z.infer<typeof analysisInputSchema>;
export type AnalysisInputV2 = Extract<AnalysisInput, { version: "2" }>;
export type AnalysisDecision = z.infer<typeof decisionSchema>;
export interface EngineResult {
  decision: AnalysisDecision;
  engine: string;
  model: string;
  raw: unknown;
}
export interface DecisionEngine {
  analyze(input: AnalysisInput): Promise<EngineResult>;
}
export interface MarketDataProvider {
  getQuote(symbol: string): Promise<MarketQuote>;
  getHistoricalData(symbol: string, period: string): Promise<MarketHistory>;
  getFundamentals(symbol: string): Promise<Fundamentals>;
}
export interface NewsProvider {
  getNews(symbol: string): Promise<NewsArticle[]>;
}
export type RunResult = {
  symbol: string;
  status: "succeeded" | "failed" | "skipped" | "running";
  analysisId?: string;
  message?: string;
};
