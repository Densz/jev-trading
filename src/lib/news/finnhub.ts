import "server-only";
import { z } from "zod";
import { newsSchema, type NewsProvider } from "@/types/analysis";
import { normalizeNews } from "@/lib/analysis/normalize";
import { ExternalGateway } from "@/server/external";
import { requireKey } from "@/server/env";
import { AppError } from "@/lib/errors";

export function normalizeFinnhubNews(raw: unknown, now = new Date(), symbol?: string) {
  const rows = z.array(z.unknown()).max(1000).parse(raw);
  const row = z.object({
    headline: z.string().min(1),
    source: z.string().min(1),
    datetime: z.number().positive().max(8.64e12),
    url: z.string(),
    summary: z.string().optional(),
    related: z.string().optional(),
  });
  let validRecords = 0;
  const articles = rows.flatMap((data) => {
    const parsed = row.safeParse(data);
    if (!parsed.success) return [];
    const value = parsed.data;
    const article = newsSchema.safeParse({
      title: value.headline.slice(0, 300),
      source: value.source.slice(0, 100),
      publishedAt: new Date(value.datetime * 1000).toISOString(),
      url: value.url,
      summary: value.summary?.slice(0, 800),
    });
    if (!article.success) return [];
    validRecords++;
    if (
      symbol &&
      value.related &&
      !value.related
        .split(",")
        .map((v) => v.trim())
        .includes(symbol)
    )
      return [];
    return [article.data];
  });
  if (rows.length && !validRecords)
    throw new AppError(
      "MALFORMED_RESPONSE",
      "The news provider returned no valid article records.",
    );
  return normalizeNews(articles, now);
}
export class FinnhubNewsProvider implements NewsProvider {
  constructor(private gateway: ExternalGateway) {}
  getNews(symbol: string) {
    return this.gateway.cached(`news:${symbol}`, 30 * 60000, "finnhub", "news", async () => {
      const now = new Date();
      const url = new URL("https://finnhub.io/api/v1/company-news");
      url.searchParams.set("symbol", symbol);
      url.searchParams.set(
        "from",
        new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10),
      );
      url.searchParams.set("to", now.toISOString().slice(0, 10));
      return normalizeFinnhubNews(
        await this.gateway.request("finnhub", "news", url, {
          "X-Finnhub-Token": requireKey("FINNHUB_API_KEY"),
        }),
        now,
        symbol,
      );
    });
  }
}
