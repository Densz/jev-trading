import {
  analysisInputSchema,
  type AnalysisInput,
  type Fundamentals,
  type MarketHistory,
  type MarketQuote,
  type NewsArticle,
} from "@/types/analysis";

export function normalizeNews(articles: NewsArticle[], now = new Date()): NewsArticle[] {
  const oldest = now.getTime() - 7 * 86400000;
  const clean = articles
    .filter((a) => {
      const time = new Date(a.publishedAt).getTime();
      return (
        Number.isFinite(time) &&
        time >= oldest &&
        time <= now.getTime() + 300000 &&
        /^https?:\/\//.test(a.url)
      );
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const result: NewsArticle[] = [];
  const words = (title: string) =>
    new Set(
      title
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  for (const article of clean) {
    const titleWords = words(article.title);
    const duplicate = result.some((other) => {
      if (
        new URL(other.url).origin + new URL(other.url).pathname ===
        new URL(article.url).origin + new URL(article.url).pathname
      )
        return true;
      const otherWords = words(other.title);
      const union = new Set([...titleWords, ...otherWords]).size;
      const intersection = [...titleWords].filter((w) => otherWords.has(w)).length;
      return union > 0 && intersection / union >= 0.75;
    });
    if (!duplicate)
      result.push({
        ...article,
        title: article.title.slice(0, 300),
        source: article.source.slice(0, 100),
        summary: article.summary?.slice(0, 800),
      });
    if (result.length === 8) break;
  }
  return result;
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
      quote.volume !== null && quote.averageVolume && quote.averageVolume > 0
        ? quote.volume / quote.averageVolume
        : null,
  };
}

export function buildAnalysisInput(options: {
  quote: MarketQuote;
  history: MarketHistory | null;
  fundamentals: Fundamentals | null;
  news: NewsArticle[];
  warnings: string[];
  horizon: AnalysisInput["horizon"];
  now?: Date;
}): AnalysisInput {
  const now = options.now ?? new Date();
  const { quote, fundamentals } = options;
  const signals = computeSignals(options.history, quote);
  const warnings = [...options.warnings];
  if (now.getTime() - new Date(quote.asOf).getTime() > 4 * 86400000)
    warnings.push("The latest market quote is more than four days old.");
  const news = normalizeNews(options.news, now);
  if (!news.length) warnings.push("No recent relevant articles were available.");
  if (!fundamentals)
    warnings.push(
      "Fundamentals were unavailable; valuation and earnings claims cannot be assessed.",
    );
  const evidence: AnalysisInput["evidence"] = [];
  const add = (id: string, text: string, kind: "bullish" | "bearish" | "risk") =>
    evidence.push({ id, text, kind });
  if (fundamentals?.revenueGrowthPercent != null) {
    const v = fundamentals.revenueGrowthPercent;
    if (Math.abs(v) >= 2)
      add(
        "revenue",
        `Reported trailing revenue growth is ${v.toFixed(1)}% year over year (${fundamentals.provider}).`,
        v > 0 ? "bullish" : "bearish",
      );
  }
  if (fundamentals?.epsGrowthPercent != null) {
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
  return analysisInputSchema.parse({
    version: "1",
    rubricVersion: "thesis-v1",
    ticker: { symbol: quote.symbol, name: quote.name, exchange: quote.exchange },
    horizon: options.horizon,
    asOf: now.toISOString(),
    market: quote,
    signals,
    fundamentals,
    news,
    warnings,
    evidence,
  });
}
