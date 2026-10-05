import {
  analysisInputV2Schema,
  type AnalysisInput,
  type AnalysisInputV2,
  type Fundamentals,
  type MarketHistory,
  type MarketQuote,
  type NewsArticle,
} from "@/types/analysis";
import type { FinancialReports, DataQuality } from "@/types/financials";
import { normalizeNews, buildNewsEvents, newsCategory } from "@/lib/news/normalize";
export { normalizeNews } from "@/lib/news/normalize";

export function assessDataQuality(
  reports: FinancialReports | null,
  news: NewsArticle[],
  candidates: number,
  now: Date,
): DataQuality {
  const periods = [
    ...(reports?.quarterly ?? []),
    ...(reports?.annual ?? []),
    ...(reports?.semiannual ?? []),
  ].sort((a, b) => b.endDate.localeCompare(a.endDate));
  const latest = periods[0];
  const sources = new Set(
    news.flatMap((article) => [
      article.source,
      ...(article.relatedSources ?? []).map((source) => source.source),
    ]),
  );
  const substantiveNews = news.filter(
    (article) => !["opinion", "other"].includes(newsCategory(article.title)),
  );
  const substantiveSources = new Set(
    substantiveNews.flatMap((article) => [
      article.source,
      ...(article.relatedSources ?? []).map((source) => source.source),
    ]),
  );
  const latestPublication =
    reports?.sources
      .map((source) => source.filedAt)
      .sort()
      .at(-1) ?? null;
  const age = latest
    ? Math.max(0, Math.floor((now.getTime() - Date.parse(latest.endDate)) / 86400000))
    : null;
  const limitations = [...(reports?.warnings ?? [])];
  if (!latest)
    limitations.push(
      "No period-specific financial reports were available; trailing ratios do not substitute for earnings statements.",
    );
  if (age !== null && age > 150)
    limitations.push("Latest financial period ended more than 150 days ago.");
  if ((reports?.quarterly.length ?? 0) < 4)
    limitations.push("Fewer than four standalone quarterly periods are available.");
  if (
    latest &&
    [latest.metrics.revenue, latest.metrics.dilutedEps, latest.metrics.operatingCashFlow].some(
      (value) => value === null,
    )
  )
    limitations.push(
      "The latest financial period lacks one or more revenue, diluted EPS, or operating cash-flow metrics.",
    );
  if (substantiveNews.length < 3 || substantiveSources.size < 2)
    limitations.push(
      "News coverage is sparse: fewer than three potentially material events or two publishers for those events. Market opinions do not satisfy this baseline; sparse coverage is not evidence that no material events occurred.",
    );
  if (!reports?.excerpts.some((excerpt) => excerpt.category === "outlook"))
    limitations.push("Management guidance has not been verified in an official source excerpt.");
  const sufficient =
    !!latest &&
    age !== null &&
    age <= 150 &&
    (reports?.quarterly.length ?? 0) >= 4 &&
    (reports?.annual.length ?? 0) >= 2 &&
    [latest.metrics.revenue, latest.metrics.dilutedEps, latest.metrics.operatingCashFlow].every(
      (value) => value !== null,
    ) &&
    substantiveNews.length >= 3 &&
    substantiveSources.size >= 2 &&
    !!reports?.excerpts.some((excerpt) => excerpt.category === "outlook");
  return {
    status: sufficient ? "sufficient" : latest ? "partial" : "limited",
    financialPeriods: {
      quarterly: reports?.quarterly.length ?? 0,
      annual: reports?.annual.length ?? 0,
      semiannual: reports?.semiannual.length ?? 0,
    },
    latestFinancialPeriodEnd: latest?.endDate ?? null,
    latestFinancialPublication: latestPublication,
    financialAgeDays: age,
    newsCandidates: candidates,
    newsIncluded: news.length,
    newsSources: sources.size,
    officialExcerpts: reports?.excerpts.length ?? 0,
    limitations: [...new Set(limitations)].slice(0, 20),
  };
}

export function computeSignals(
  history: MarketHistory | null,
  quote: MarketQuote,
): AnalysisInput["signals"] {
  const points = [...(history?.points ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const closes = points.map((p) => p.close);
  const average = (length: number) =>
    closes.length >= length ? closes.slice(-length).reduce((sum, v) => sum + v, 0) / length : null;
  // Compare the latest quote against completed daily bars, avoiding an in-progress bar.
  const prior = points.filter((p) => p.date < quote.asOf.slice(0, 10));
  const change = (days: number) =>
    prior.length >= days ? (quote.price / prior.at(-days)!.close - 1) * 100 : null;
  const returns = closes
    .slice(1)
    .map((close, i) => Math.log(close / closes[i]))
    .slice(-20);
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const volatility =
    returns.length >= 10
      ? Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1)) *
        Math.sqrt(252) *
        100
      : null;
  return {
    weeklyChangePercent: change(5),
    monthlyChangePercent: change(21),
    movingAverage20: average(20),
    movingAverage50: average(50),
    annualizedVolatilityPercent: volatility,
    volumeRatio:
      prior.at(-1)?.volume != null && quote.averageVolume && quote.averageVolume > 0
        ? prior.at(-1)!.volume! / quote.averageVolume
        : null,
    volumeRatioBasis:
      prior.at(-1)?.volume != null && quote.averageVolume && quote.averageVolume > 0
        ? "completed-session"
        : "unavailable",
    volumeRatioSessionDate:
      prior.at(-1)?.volume != null && quote.averageVolume && quote.averageVolume > 0
        ? prior.at(-1)!.date
        : null,
  };
}

export function buildAnalysisInput(options: {
  quote: MarketQuote;
  history: MarketHistory | null;
  fundamentals: Fundamentals | null;
  financialReports?: FinancialReports | null;
  news: NewsArticle[];
  warnings: string[];
  horizon: AnalysisInput["horizon"];
  now?: Date;
}): AnalysisInputV2 {
  const now = options.now ?? new Date();
  const { quote, fundamentals } = options;
  const signals = computeSignals(options.history, quote);
  const warnings = [...options.warnings];
  if (now.getTime() - new Date(quote.asOf).getTime() > 4 * 86400000)
    warnings.push("The latest market quote is more than four days old.");
  const reports = options.financialReports ?? null;
  const officialNews: NewsArticle[] = (reports?.sources ?? []).flatMap((source) => {
    const excerpts = reports!.excerpts.filter((excerpt) => excerpt.sourceId === source.id);
    return excerpts.length
      ? [
          {
            title: `${quote.name}: ${source.form.startsWith("8-K") ? "earnings release and outlook" : source.form.includes("Q") ? "quarterly financial report" : "annual financial report"}`,
            source: "SEC EDGAR / issuer",
            sourceType: "issuer-filing" as const,
            publishedAt: `${source.filedAt}T00:00:00.000Z`,
            url: source.url,
            summary: excerpts
              .map((excerpt) => excerpt.text)
              .join(" ")
              .slice(0, 1000),
          },
        ]
      : [];
  });
  const news = normalizeNews([...officialNews, ...options.news], now);
  const dataQuality = assessDataQuality(
    reports,
    news,
    options.news.length + officialNews.length,
    now,
  );
  warnings.push(...dataQuality.limitations);
  if (!news.length) warnings.push("No recent relevant articles were available.");
  if (!fundamentals)
    warnings.push(
      "Fundamentals were unavailable; valuation and earnings claims cannot be assessed.",
    );
  const evidence: AnalysisInput["evidence"] = [];
  const add = (
    id: string,
    text: string,
    kind: "bullish" | "bearish" | "risk",
    sourceRefs?: string[],
  ) => evidence.push({ id, text, kind, ...(sourceRefs ? { sourceRefs } : {}) });
  const latestQuarter = reports?.quarterly[0];
  if (latestQuarter) {
    const prefix = `Fiscal quarter ${latestQuarter.startDate} to ${latestQuarter.endDate}`;
    const { changes, metrics, provenance } = latestQuarter;
    if (changes.revenueYoYPercent !== null)
      add(
        "quarterly-revenue",
        `${prefix}: reported revenue changed ${changes.revenueYoYPercent.toFixed(1)}% versus the comparable prior-year quarter.`,
        changes.revenueYoYPercent >= 0 ? "bullish" : "bearish",
        provenance.revenue?.sourceIds,
      );
    if (changes.dilutedEpsYoYPercent !== null)
      add(
        "quarterly-eps",
        `${prefix}: diluted EPS changed ${changes.dilutedEpsYoYPercent.toFixed(1)}% year over year on a positive comparison base.`,
        changes.dilutedEpsYoYPercent >= 0 ? "bullish" : "bearish",
        provenance.dilutedEps?.sourceIds,
      );
    if (changes.grossMarginYoYPoints !== null)
      add(
        "quarterly-margin",
        `${prefix}: gross margin changed ${changes.grossMarginYoYPoints.toFixed(1)} percentage points year over year.`,
        changes.grossMarginYoYPoints >= 0 ? "bullish" : "bearish",
        provenance.grossProfit?.sourceIds,
      );
    if (metrics.freeCashFlow !== null)
      add(
        "quarterly-cash",
        `${prefix}: operating cash flow minus reported capital expenditure equals ${metrics.freeCashFlow.toLocaleString("en-US")} ${latestQuarter.currency}. This is a derived cash-flow measure, not management guidance.`,
        metrics.freeCashFlow >= 0 ? "bullish" : "bearish",
        provenance.freeCashFlow?.sourceIds,
      );
  }
  const latestAnnual = reports?.annual[0];
  if (latestAnnual) {
    const prefix = `Fiscal year ${latestAnnual.startDate} to ${latestAnnual.endDate}`;
    const { changes, metrics, provenance } = latestAnnual;
    if (changes.revenueYoYPercent !== null)
      add(
        "annual-revenue",
        `${prefix}: reported revenue changed ${changes.revenueYoYPercent.toFixed(1)}% versus the comparable prior fiscal year.`,
        changes.revenueYoYPercent >= 0 ? "bullish" : "bearish",
        provenance.revenue?.sourceIds,
      );
    if (changes.dilutedEpsYoYPercent !== null)
      add(
        "annual-eps",
        `${prefix}: diluted EPS changed ${changes.dilutedEpsYoYPercent.toFixed(1)}% versus a positive prior-year comparison base.`,
        changes.dilutedEpsYoYPercent >= 0 ? "bullish" : "bearish",
        provenance.dilutedEps?.sourceIds,
      );
    if (metrics.netIncome !== null && metrics.netIncome > 0 && metrics.operatingCashFlow !== null)
      add(
        "annual-cash-conversion",
        `${prefix}: operating cash flow is ${((metrics.operatingCashFlow / metrics.netIncome) * 100).toFixed(1)}% of reported net income. Working-capital movements and non-cash expenses can affect this derived ratio.`,
        metrics.operatingCashFlow < metrics.netIncome * 0.8 ? "risk" : "bullish",
        [
          ...new Set([
            ...(provenance.operatingCashFlow?.sourceIds ?? []),
            ...(provenance.netIncome?.sourceIds ?? []),
          ]),
        ].slice(0, 4),
      );
  }
  const priorQuarter = reports?.quarterly[1];
  if (
    latestQuarter &&
    priorQuarter &&
    latestQuarter.changes.revenueYoYPercent !== null &&
    priorQuarter.changes.revenueYoYPercent !== null &&
    Date.parse(latestQuarter.endDate) - Date.parse(priorQuarter.endDate) <= 110 * 86400000
  ) {
    const delta = latestQuarter.changes.revenueYoYPercent - priorQuarter.changes.revenueYoYPercent;
    add(
      "revenue-growth-change",
      `Revenue YoY growth changed from ${priorQuarter.changes.revenueYoYPercent.toFixed(1)}% in the prior quarter to ${latestQuarter.changes.revenueYoYPercent.toFixed(1)}% in the latest quarter (${delta >= 0 ? "+" : ""}${delta.toFixed(1)} percentage points). This is growth acceleration/deceleration, not absolute revenue decline.`,
      delta >= 0 ? "bullish" : "bearish",
      [
        ...new Set([
          ...(latestQuarter.provenance.revenue?.sourceIds ?? []),
          ...(priorQuarter.provenance.revenue?.sourceIds ?? []),
        ]),
      ].slice(0, 4),
    );
  }
  for (const excerpt of (reports?.excerpts ?? [])
    .filter((entry) => entry.category === "risks")
    .slice(0, 2))
    add(
      `filing-risk-${evidence.length}`,
      `Issuer risk disclosure (excerpt): ${excerpt.text.slice(0, 430)}`,
      "risk",
      [excerpt.sourceId],
    );
  if (!latestQuarter && fundamentals?.revenueGrowthPercent != null) {
    const v = fundamentals.revenueGrowthPercent;
    if (Math.abs(v) >= 2)
      add(
        "revenue",
        `Reported trailing revenue growth is ${v.toFixed(1)}% year over year (${fundamentals.provider}).`,
        v > 0 ? "bullish" : "bearish",
      );
  }
  if (!latestQuarter && fundamentals?.epsGrowthPercent != null) {
    const v = fundamentals.epsGrowthPercent;
    if (Math.abs(v) >= 2)
      add(
        "earnings",
        `Reported trailing EPS growth is ${v.toFixed(1)}% year over year (${fundamentals.provider}).`,
        v > 0 ? "bullish" : "bearish",
      );
  }
  if (fundamentals?.peRatio != null && fundamentals.peRatio > 40)
    add(
      "valuation",
      `Trailing P/E is ${fundamentals.peRatio.toFixed(1)}; valuation may amplify downside if growth disappoints.`,
      "risk",
    );
  if (signals.movingAverage50 != null)
    add(
      "trend",
      `Price is ${quote.price >= signals.movingAverage50 ? "above" : "below"} its 50-session moving average; this is a price trend, not evidence of improving fundamentals.`,
      quote.price >= signals.movingAverage50 ? "bullish" : "bearish",
    );
  if (signals.monthlyChangePercent != null && Math.abs(signals.monthlyChangePercent) >= 3)
    add(
      "momentum",
      `Price changed ${signals.monthlyChangePercent.toFixed(1)}% over approximately 21 trading sessions.`,
      signals.monthlyChangePercent > 0 ? "bullish" : "bearish",
    );
  if (signals.annualizedVolatilityPercent != null && signals.annualizedVolatilityPercent > 40)
    add(
      "volatility",
      `Recent annualized price volatility is ${signals.annualizedVolatilityPercent.toFixed(1)}%; large swings are possible.`,
      "risk",
    );
  return analysisInputV2Schema.parse({
    version: "2",
    rubricVersion: "thesis-v2",
    ticker: { symbol: quote.symbol, name: quote.name, exchange: quote.exchange },
    horizon: options.horizon,
    asOf: now.toISOString(),
    market: quote,
    signals,
    fundamentals,
    news,
    warnings: [...new Set(warnings)].slice(0, 20),
    evidence,
    financialReports: reports,
    newsEvents: buildNewsEvents(news),
    dataQuality,
  });
}
