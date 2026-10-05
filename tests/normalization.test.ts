import { describe, expect, it } from "vitest";
import { buildAnalysisInput, computeSignals, normalizeNews } from "@/lib/analysis/normalize";
import { normalizeHistory, normalizeQuote } from "@/lib/market/twelve-data";
import { normalizeFinnhubNews } from "@/lib/news/finnhub";
import { quote, history, article, now } from "./fixtures";

describe("market normalization", () => {
  const raw = {
    symbol: "AAPL",
    name: "Apple",
    exchange: "NASDAQ",
    currency: "USD",
    close: "100",
    change: "1",
    percent_change: "1.01",
    timestamp: now.getTime() / 1000,
  };
  it("normalizes numeric strings and keeps missing volume unknown", () => {
    const result = normalizeQuote(raw, "AAPL", now);
    expect(result.price).toBe(100);
    expect(result.volume).toBeNull();
    expect(result.asOf).toBe(now.toISOString());
  });
  it("rejects malformed, zero, and mismatched quotes", () => {
    expect(() => normalizeQuote({ ...raw, close: "NaN" }, "AAPL", now)).toThrow();
    expect(() => normalizeQuote({ ...raw, close: "0" }, "AAPL", now)).toThrow();
    expect(() => normalizeQuote(raw, "MSFT", now)).toThrow("different ticker");
    expect(() =>
      normalizeQuote({ ...raw, timestamp: now.getTime() / 1000 + 3600 }, "AAPL", now),
    ).toThrow("future");
  });
  it("sorts and deduplicates daily bars", () => {
    const result = normalizeHistory(
      {
        meta: { symbol: "AAPL" },
        values: [
          { datetime: "2026-10-02", close: "99" },
          { datetime: "2026-10-01", close: "98" },
          { datetime: "2026-10-01", close: "98" },
        ],
      },
      "AAPL",
      now,
    );
    expect(result.points.map((p) => p.date)).toEqual(["2026-10-01", "2026-10-02"]);
  });
  it("calculates indicators in code and does not invent missing data", () => {
    const signals = computeSignals(history, quote);
    expect(signals.movingAverage50).toBeCloseTo(87.25);
    expect(signals.volumeRatio).toBe(1.25);
    expect(signals.weeklyChangePercent).toBeCloseTo((100 / 97.5 - 1) * 100);
    expect(computeSignals(null, quote).monthlyChangePercent).toBeNull();
    expect(computeSignals(null, { ...quote, averageVolume: 0 }).volumeRatio).toBeNull();
  });
});
describe("news and context normalization", () => {
  it("deduplicates similar stories and tracking URLs, filters dates, and bounds articles", () => {
    const articles = [
      article,
      { ...article, url: `${article.url}?utm_source=feed` },
      {
        ...article,
        title: "Apple reports stronger quarterly earnings and revenue today",
        url: "https://example.com/syndication",
      },
      {
        ...article,
        title: "Old",
        url: "https://example.com/old",
        publishedAt: "2026-09-01T00:00:00Z",
      },
      {
        ...article,
        title: "Future",
        url: "https://example.com/future",
        publishedAt: "2027-01-01T00:00:00Z",
      },
      ...Array.from({ length: 12 }, (_, i) => ({
        ...article,
        title: `Distinct${i} topic${i} company${i} event${i}`,
        url: `https://example.com/${i}`,
      })),
    ];
    const result = normalizeNews(articles, now);
    expect(result).toHaveLength(12);
    expect(result.filter((a) => a.title.startsWith("Apple"))).toHaveLength(1);
    expect(result.some((a) => ["Old", "Future"].includes(a.title))).toBe(false);
  });
  it("normalizes Finnhub timestamps and rejects non-web links", () => {
    const result = normalizeFinnhubNews(
      [
        {
          headline: article.title,
          source: "News",
          datetime: now.getTime() / 1000,
          url: article.url,
        },
        {
          headline: "Unsafe link",
          source: "News",
          datetime: now.getTime() / 1000,
          url: "javascript:alert(1)",
        },
      ],
      now,
    );
    expect(result).toHaveLength(1);
    expect(result[0].publishedAt).toBe(now.toISOString());
  });
  it("preserves Finnhub article identity, removes only tracking parameters, and retains grouped sources", () => {
    const result = normalizeNews(
      [
        { ...article, url: "https://finnhub.io/api/news?id=A&utm_source=feed" },
        {
          ...article,
          title: "New export regulation impacts product shipments",
          url: "https://finnhub.io/api/news?id=B",
        },
        { ...article, source: "Second publisher", url: "https://another.example/earnings" },
      ],
      now,
    );
    expect(result).toHaveLength(2);
    expect(result[0].relatedSources).toEqual([
      { source: "Second publisher", url: "https://another.example/earnings" },
    ]);
    expect(result.some((entry) => entry.url.includes("id=B"))).toBe(true);
  });
  it("uses a thirty-day window and prioritizes material events over newer market opinions", () => {
    const result = normalizeNews(
      [
        {
          ...article,
          title: "Stocks just hit record highs and look cheap",
          url: "https://example.com/opinion",
          publishedAt: now.toISOString(),
        },
        {
          ...article,
          title: "Issuer announces revised guidance",
          url: "https://example.com/guidance",
          publishedAt: "2026-09-15T12:00:00Z",
        },
      ],
      now,
    );
    expect(result.map((entry) => entry.url)).toEqual([
      "https://example.com/guidance",
      "https://example.com/opinion",
    ]);
  });
  it("does not use an opening-session quote volume as a full-session volume ratio", () => {
    expect(computeSignals(history, { ...quote, volume: 1 }).volumeRatio).toBe(1.25);
  });
  it("makes unavailable data explicit and distinguishes trends from fundamentals", () => {
    const result = buildAnalysisInput({
      quote,
      history,
      fundamentals: null,
      news: [],
      warnings: ["News unavailable"],
      horizon: "medium-term",
      now,
    });
    expect(result.warnings).toContain(
      "Fundamentals were unavailable; valuation and earnings claims cannot be assessed.",
    );
    expect(result.evidence.find((e) => e.id === "trend")?.text).toContain(
      "not evidence of improving fundamentals",
    );
    expect(result.news).toEqual([]);
  });
});
