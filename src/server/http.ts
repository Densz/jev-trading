import "server-only";
import { ZodError } from "zod";
import { AppError, safeError } from "@/lib/errors";
export async function readBody(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 2048)
    throw new AppError("INPUT_TOO_LARGE", "Request body too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("INVALID_INPUT", "A JSON request body is required.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 2048) {
      await reader.cancel();
      throw new AppError("INPUT_TOO_LARGE", "Request body too large.", 413);
    }
    chunks.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new AppError("INVALID_INPUT", "The request body must be valid JSON.", 400);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof ZodError)
    return Response.json(
      { error: error.issues[0]?.message ?? "Invalid input.", code: "INVALID_INPUT" },
      { status: 400 },
    );
  const known = safeError(error);
  console.error(JSON.stringify({ event: "api_error", code: known.code, message: known.message }));
  return Response.json({ error: known.message, code: known.code }, { status: known.status });
}
