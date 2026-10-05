import { symbolSchema } from "@/types/analysis";
import { errorResponse, readBody } from "@/server/http";
import { setTickerEnabled } from "@/server/ticker-service";
import { z } from "zod";
export async function PATCH(request: Request, context: { params: Promise<{ symbol: string }> }) {
  try {
    const symbol = symbolSchema.parse((await context.params).symbol);
    const { enabled } = z
      .object({ enabled: z.boolean() })
      .strict()
      .parse(await readBody(request));
    await setTickerEnabled(symbol, enabled);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
