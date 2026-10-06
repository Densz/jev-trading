import { symbolSchema } from "@/types/analysis";
import { analysisService } from "@/server/analysis-service";
import { errorResponse, readBody } from "@/server/http";
import { analysisOptionsSchema } from "@/lib/ai/config";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request, context: { params: Promise<{ symbol: string }> }) {
  try {
    const symbol = symbolSchema.parse((await context.params).symbol);
    const { provider, ...options } = analysisOptionsSchema.parse(await readBody(request));
    const result = await (
      await analysisService(provider)
    ).analyzeTicker(symbol, { ...options, trigger: "manual" });
    return Response.json(result, {
      status: result.status === "failed" ? 502 : result.status === "running" ? 409 : 200,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
