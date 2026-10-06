import { analysisService } from "@/server/analysis-service";
import { errorResponse, readBody } from "@/server/http";
import { analysisOptionsSchema } from "@/lib/ai/config";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    const { provider, ...options } = analysisOptionsSchema.parse(await readBody(request));
    const service = await analysisService(provider);
    const encoder = new TextEncoder();
    let closed = false;
    const stream = new ReadableStream({
      async start(controller) {
        const send = (value: unknown) => {
          if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        };
        // Keep the connection alive during provider rate-limit waits.
        const heartbeat = setInterval(() => send({ type: "heartbeat" }), 10000);
        try {
          await service.analyzeAllEnabledTickers({
            ...options,
            trigger: "manual-all",
            onResult: (result) => send({ type: "result", ...result }),
          });
          send({ type: "complete" });
        } catch {
          send({
            type: "error",
            message: "The batch could not be completed. Check server logs and retry.",
          });
        } finally {
          clearInterval(heartbeat);
          if (!closed) controller.close();
          closed = true;
        }
      },
      cancel() {
        closed = true;
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
