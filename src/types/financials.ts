import { z } from "zod";

const metric = z.number().finite().nullable();
const sourceSchema = z.object({
  id: z.string().max(100),
  form: z.string().max(20),
  filedAt: z.iso.date(),
  url: z.url().refine((url) => /^https:\/\//.test(url)),
});
export const financialMetricsSchema = z.object({
  revenue: metric,
  grossProfit: metric,
  operatingIncome: metric,
  netIncome: metric,
  dilutedEps: metric,
  operatingCashFlow: metric,
  capitalExpenditure: metric,
  freeCashFlow: metric,
  cash: metric,
  longTermDebt: metric,
  grossMarginPercent: metric,
  operatingMarginPercent: metric,
  netMarginPercent: metric,
});
export const financialPeriodSchema = z.object({
  id: z.string().max(100),
  periodType: z.enum(["quarterly", "annual", "semiannual"]),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  currency: z.string().length(3),
  accountingBasis: z.literal("as-reported"),
  metrics: financialMetricsSchema,
  provenance: z.record(
    z.string(),
    z.object({
      concept: z.string().max(200),
      sourceIds: z.array(z.string().max(100)).max(4),
      method: z.enum(["reported", "difference", "ratio", "sum"]),
    }),
  ),
  changes: z.object({
    revenueYoYPercent: metric,
    dilutedEpsYoYPercent: metric,
    grossMarginYoYPoints: metric,
  }),
});
export const filingExcerptSchema = z.object({
  category: z.enum(["outlook", "segments", "risks", "operations"]),
  text: z.string().min(1).max(700),
  sourceId: z.string().max(100),
  truncated: z.boolean(),
});
export const financialReportsSchema = z.object({
  provider: z.string().max(100),
  fetchedAt: z.iso.datetime(),
  cik: z.string().regex(/^\d{10}$/),
  quarterly: z.array(financialPeriodSchema).max(8),
  annual: z.array(financialPeriodSchema).max(3),
  semiannual: z.array(financialPeriodSchema).max(2),
  sources: z.array(sourceSchema).max(40),
  excerpts: z.array(filingExcerptSchema).max(8),
  warnings: z.array(z.string().max(500)).max(20),
});
export const dataQualitySchema = z.object({
  status: z.enum(["limited", "partial", "sufficient"]),
  financialPeriods: z.object({
    quarterly: z.number().int(),
    annual: z.number().int(),
    semiannual: z.number().int(),
  }),
  latestFinancialPeriodEnd: z.iso.date().nullable(),
  latestFinancialPublication: z.iso.date().nullable(),
  financialAgeDays: z.number().int().nullable(),
  newsCandidates: z.number().int(),
  newsIncluded: z.number().int(),
  newsSources: z.number().int(),
  officialExcerpts: z.number().int(),
  limitations: z.array(z.string().max(500)).max(20),
});
export type FinancialMetrics = z.infer<typeof financialMetricsSchema>;
export type FinancialPeriod = z.infer<typeof financialPeriodSchema>;
export type FinancialReports = z.infer<typeof financialReportsSchema>;
export type FinancialSource = FinancialReports["sources"][number];
export type FilingExcerpt = z.infer<typeof filingExcerptSchema>;
export type DataQuality = z.infer<typeof dataQualitySchema>;
export interface FinancialReportsProvider {
  getReports(symbol: string): Promise<FinancialReports>;
}
