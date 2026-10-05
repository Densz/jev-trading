import "server-only";
import { db } from "@/db/client";
import { AppError } from "@/lib/errors";
import type { MarketQuote } from "@/types/analysis";

export async function saveTicker(quote: MarketQuote) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('watchlist'))`;
    const existing = await tx.ticker.findUnique({ where: { symbol: quote.symbol } });
    if (existing?.enabled)
      throw new AppError("ALREADY_EXISTS", `${quote.symbol} is already in your watchlist.`, 409);
    if ((await tx.ticker.count({ where: { enabled: true } })) >= 50)
      throw new AppError("WATCHLIST_LIMIT", "V1 supports up to 50 enabled tickers.", 400);
    return tx.ticker.upsert({
      where: { symbol: quote.symbol },
      create: { symbol: quote.symbol, name: quote.name, exchange: quote.exchange },
      update: { enabled: true, name: quote.name, exchange: quote.exchange },
    });
  });
}
export async function setTickerEnabled(symbol: string, enabled: boolean) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('watchlist'))`;
    const ticker = await tx.ticker.findUnique({ where: { symbol } });
    if (!ticker) throw new AppError("NOT_FOUND", "Ticker not found.", 404);
    if (enabled && !ticker.enabled && (await tx.ticker.count({ where: { enabled: true } })) >= 50)
      throw new AppError("WATCHLIST_LIMIT", "V1 supports up to 50 enabled tickers.", 400);
    return tx.ticker.update({ where: { symbol }, data: { enabled } });
  });
}
