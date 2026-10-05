import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import {
  fundamentalsSchema,
  historySchema,
  quoteSchema,
  type MarketDataProvider,
} from "@/types/analysis";
import { requireKey } from "@/server/env";
import { ExternalGateway } from "@/server/external";

const number = z
  .union([z.string().min(1), z.number()])
  .transform(Number)
  .pipe(z.number().finite());
const optionalNumber = z
  .union([number, z.null(), z.literal("")])
  .optional()
  .transform((v) => (typeof v === "number" ? v : null));
const rawQuote = z.object({
  symbol: z.string(),
  name: z.string(),
  exchange: z.string(),
  currency: z.string(),
  close: number,
  change: number,
  percent_change: number,
  timestamp: z.number().positive(),
  volume: optionalNumber,
  average_volume: optionalNumber,
  fifty_two_week: z.object({ high: optionalNumber, low: optionalNumber }).optional(),
});
export function normalizeQuote(raw: unknown, expectedSymbol: string, now = new Date()) {
  const value = rawQuote.parse(raw);
  if (value.symbol.toUpperCase() !== expectedSymbol)
    throw new AppError("SYMBOL_MISMATCH", "The provider returned a different ticker.");
  if (value.timestamp * 1000 > now.getTime() + 300000)
    throw new AppError("INVALID_TIMESTAMP", "The provider quote has a timestamp in the future.");
  return quoteSchema.parse({
    symbol: value.symbol,
    name: value.name,
    exchange: value.exchange,
    currency: value.currency,
    price: value.close,
    change: value.change,
    changePercent: value.percent_change,
    volume: value.volume,
    averageVolume: value.average_volume,
    fiftyTwoWeekHigh: value.fifty_two_week?.high ?? null,
    fiftyTwoWeekLow: value.fifty_two_week?.low ?? null,
    asOf: new Date(value.timestamp * 1000).toISOString(),
    fetchedAt: now.toISOString(),
    provider: "Twelve Data",
  });
}
export function normalizeHistory(raw: unknown, symbol: string, now = new Date()) {
  const value = z
    .object({
      meta: z.object({ symbol: z.string() }),
      values: z
        .array(z.object({ datetime: z.string(), close: number, volume: optionalNumber }))
        .min(1)
        .max(260),
    })
    .parse(raw);
  if (value.meta.symbol.toUpperCase() !== symbol)
    throw new AppError("SYMBOL_MISMATCH", "Historical data does not match the requested ticker.");
  const unique = new Map(
    value.values.map((p) => [
      p.datetime.slice(0, 10),
      { date: p.datetime.slice(0, 10), close: p.close, volume: p.volume },
    ]),
  );
  return historySchema.parse({
    symbol,
    provider: "Twelve Data",
    fetchedAt: now.toISOString(),
    points: [...unique.values()].sort((a, b) => a.date.localeCompare(b.date)),
  });
}
export class TwelveDataMarketProvider implements MarketDataProvider {
  constructor(private gateway: ExternalGateway) {}
  private url(path: string, symbol: string) {
    const url = new URL(`https://api.twelvedata.com/${path}`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("apikey", requireKey("TWELVE_DATA_API_KEY"));
    return url;
  }
  getQuote(symbol: string) {
    return this.gateway.cached(`quote:${symbol}`, 5 * 60000, "twelvedata", "quote", async () =>
      normalizeQuote(
        await this.gateway.request("twelvedata", "quote", this.url("quote", symbol)),
        symbol,
      ),
    );
  }
  getHistoricalData(symbol: string, period: string) {
    if (period !== "3mo")
      throw new AppError(
        "INVALID_PERIOD",
        "Only the three-month daily history is supported in V1.",
        400,
      );
    return this.gateway.cached(
      `history:${symbol}:3mo`,
      24 * 3600000,
      "twelvedata",
      "history",
      async () => {
        const url = this.url("time_series", symbol);
        url.searchParams.set("interval", "1day");
        url.searchParams.set("outputsize", "65");
        url.searchParams.set("order", "asc");
        return normalizeHistory(await this.gateway.request("twelvedata", "history", url), symbol);
      },
    );
  }
  getFundamentals(symbol: string) {
    return this.gateway.cached(
      `fundamentals:${symbol}`,
      12 * 3600000,
      "finnhub",
      "fundamentals",
      async () => {
        const url = new URL("https://finnhub.io/api/v1/stock/metric");
        url.searchParams.set("symbol", symbol);
        url.searchParams.set("metric", "all");
        const raw = await this.gateway.request("finnhub", "fundamentals", url, {
          "X-Finnhub-Token": requireKey("FINNHUB_API_KEY"),
        });
        const value = z
          .object({ symbol: z.string(), metric: z.record(z.string(), z.unknown()) })
          .parse(raw);
        if (value.symbol !== symbol)
          throw new AppError("SYMBOL_MISMATCH", "Fundamentals do not match the requested ticker.");
        const read = (key: string) =>
          typeof value.metric[key] === "number" && Number.isFinite(value.metric[key])
            ? (value.metric[key] as number)
            : null;
        const fundamentals = fundamentalsSchema.parse({
          provider: "Finnhub",
          fetchedAt: new Date().toISOString(),
          peRatio: read("peTTM"),
          epsGrowthPercent: read("epsGrowthTTMYoy"),
          revenueGrowthPercent: read("revenueGrowthTTMYoy"),
          netMarginPercent: read("netProfitMarginTTM"),
        });
        if (
          [
            fundamentals.peRatio,
            fundamentals.epsGrowthPercent,
            fundamentals.revenueGrowthPercent,
            fundamentals.netMarginPercent,
          ].every((v) => v === null)
        )
          throw new AppError("NO_FUNDAMENTALS", "No supported fundamental metrics were available.");
        return fundamentals;
      },
    );
  }
}
