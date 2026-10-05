import { db } from "@/db/client";
import { symbolSchema } from "@/types/analysis";
import { createProviders } from "@/server/providers";
import { errorResponse, readBody } from "@/server/http";
import { AppError } from "@/lib/errors";
import { z } from "zod";
import { saveTicker } from "@/server/ticker-service";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    const { symbol } = z
      .object({ symbol: symbolSchema })
      .strict()
      .parse(await readBody(request));
    const existing = await db.ticker.findUnique({ where: { symbol } });
    if (existing?.enabled)
      throw new AppError("ALREADY_EXISTS", `${symbol} is already in your watchlist.`, 409);
    if ((await db.ticker.count({ where: { enabled: true } })) >= 50)
      throw new AppError("WATCHLIST_LIMIT", "V1 supports up to 50 enabled tickers.", 400);
    const quote = await createProviders(symbol).market.getQuote(symbol);
    if (
      quote.currency !== "USD" ||
      !["NASDAQ", "NYSE", "NYSE AMERICAN", "AMEX", "ARCA", "NYSE ARCA", "BATS", "CBOE"].includes(
        quote.exchange.toUpperCase(),
      )
    )
      throw new AppError(
        "UNSUPPORTED_MARKET",
        "V1 supports US-listed equities. This symbol is outside the supported market scope.",
        400,
      );
    const ticker = await saveTicker(quote);
    return Response.json({ ticker }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
