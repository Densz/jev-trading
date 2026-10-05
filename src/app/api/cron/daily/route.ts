import { timingSafeEqual } from "node:crypto";
import { analyzeAllEnabledTickers } from "@/server/analysis-service";
import { getEnv } from "@/server/env";
import { errorResponse } from "@/server/http";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const secret = getEnv().CRON_SECRET;
  if (!secret || secret.length < 32)
    return Response.json({ error: "Cron endpoint is not configured." }, { status: 503 });
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ results: await analyzeAllEnabledTickers() });
  } catch (error) {
    return errorResponse(error);
  }
}
