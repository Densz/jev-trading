import "server-only";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "@/db/client";
import { AppError, safeError } from "@/lib/errors";
import { dataMode, getEnv } from "@/server/env";
import type { Prisma } from "@/generated/prisma/client";

export const jsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export type UsageEntry = {
  provider: string;
  operation: string;
  cached: boolean;
  success: boolean;
  attempt: number;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  errorCode?: string;
};
export class ExternalGateway {
  constructor(
    readonly symbol: string,
    readonly runId?: string,
    readonly fetcher: typeof fetch = fetch,
  ) {}
  async record(entry: UsageEntry) {
    // Persist usage before an analysis is considered successful. Missing costs remain null.
    await db.apiUsage.create({
      data: { ...entry, symbol: this.symbol, runId: this.runId, dataMode: dataMode() },
    });
    console.info(
      JSON.stringify({ event: "external_api", symbol: this.symbol, runId: this.runId, ...entry }),
    );
  }
  async cached<T>(
    key: string,
    ttlMs: number,
    provider: string,
    operation: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const cacheKey = `${dataMode()}:${key}`;
    const cached = await db.providerCache.findUnique({ where: { key: cacheKey } });
    if (cached && cached.expiresAt > new Date()) {
      await this.record({
        provider,
        operation,
        cached: true,
        success: true,
        attempt: 0,
        durationMs: 0,
        estimatedCostUsd: 0,
      });
      return cached.value as T;
    }
    const value = await fetcher();
    await db.providerCache.upsert({
      where: { key: cacheKey },
      create: { key: cacheKey, value: jsonValue(value), expiresAt: new Date(Date.now() + ttlMs) },
      update: {
        value: jsonValue(value),
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return value;
  }
  async reserve(provider: string) {
    const limit = provider === "twelvedata" ? getEnv().TWELVE_DATA_CREDITS_PER_MINUTE : 50;
    const deadline = Date.now() + 65000;
    while (true) {
      const wait = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rate:${provider}`}))`;
        const bucket = await tx.rateLimitBucket.findUnique({ where: { key: provider } });
        const now = new Date();
        if (!bucket || now.getTime() - bucket.startedAt.getTime() >= 61000) {
          await tx.rateLimitBucket.upsert({
            where: { key: provider },
            create: { key: provider, startedAt: now, count: 1 },
            update: { startedAt: now, count: 1 },
          });
          return 0;
        }
        if (bucket.count < limit) {
          await tx.rateLimitBucket.update({
            where: { key: provider },
            data: { count: { increment: 1 } },
          });
          return 0;
        }
        return 61000 - (now.getTime() - bucket.startedAt.getTime());
      });
      if (!wait) return;
      if (Date.now() + wait > deadline)
        throw new AppError(
          "RATE_LIMITED",
          "Provider allowance is exhausted. Please retry in a minute.",
          429,
        );
      await delay(wait);
    }
  }
  async request(
    provider: string,
    operation: string,
    url: URL,
    headers?: Record<string, string>,
    options: { responseType?: "json" | "text"; maxBytes?: number } = {},
  ): Promise<unknown> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.reserve(provider);
      const started = Date.now();
      let retryAfter = 0;
      try {
        const response = await this.fetcher(url, {
          headers,
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
          redirect: provider === "sec" ? "error" : "follow",
        });
        const retryHeader = response.headers.get("retry-after");
        if (retryHeader)
          retryAfter = /^\d+$/.test(retryHeader)
            ? Number(retryHeader) * 1000
            : Math.max(0, Date.parse(retryHeader) - Date.now());
        if (!response.ok) {
          const status = response.status;
          await response.body?.cancel();
          throw new AppError(
            status === 429
              ? "RATE_LIMITED"
              : status === 401 || status === 403
                ? "PROVIDER_AUTH"
                : "PROVIDER_UNAVAILABLE",
            status === 429
              ? "The data provider is rate limiting requests."
              : status === 401 || status === 403
                ? "The data provider rejected the API key or plan entitlement."
                : "The data provider is temporarily unavailable.",
            502,
            status === 429 || status >= 500,
          );
        }
        const reader = response.body?.getReader();
        if (!reader)
          throw new AppError("MALFORMED_RESPONSE", "The provider returned an empty response.");
        let size = 0;
        const chunks: Uint8Array[] = [];
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > (options.maxBytes ?? 2_000_000)) {
            await reader.cancel();
            throw new AppError(
              "RESPONSE_TOO_LARGE",
              "The provider response exceeded the size limit.",
            );
          }
          chunks.push(chunk.value);
        }
        let body: unknown;
        try {
          const text = Buffer.concat(chunks).toString("utf8");
          body = options.responseType === "text" ? text : JSON.parse(text);
        } catch {
          throw new AppError("MALFORMED_RESPONSE", "The provider returned invalid JSON.");
        }
        // Twelve Data can return an error payload with HTTP 200.
        if (body && typeof body === "object" && "status" in body && body.status === "error") {
          const code = "code" in body ? Number(body.code) : 500;
          throw new AppError(
            code === 429
              ? "RATE_LIMITED"
              : code === 400 || code === 404
                ? "UNKNOWN_TICKER"
                : "PROVIDER_UNAVAILABLE",
            code === 400 || code === 404
              ? "The ticker was not found or is unavailable on your provider plan."
              : "The data provider could not fulfill the request.",
            code === 400 || code === 404 ? 404 : 502,
            code === 429 || code >= 500,
          );
        }
        await this.record({
          provider,
          operation,
          cached: false,
          success: true,
          attempt,
          durationMs: Date.now() - started,
          estimatedCostUsd: 0,
        });
        return body;
      } catch (error) {
        const known =
          error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)
            ? new AppError("TIMEOUT", "The data provider timed out.", 504, true)
            : error instanceof TypeError
              ? new AppError(
                  "CONNECTION_ERROR",
                  "Could not connect to the data provider.",
                  502,
                  true,
                )
              : safeError(error);
        await this.record({
          provider,
          operation,
          cached: false,
          success: false,
          attempt,
          durationMs: Date.now() - started,
          errorCode: known.code,
        });
        if (attempt === 3 || !known.retryable) throw known;
        await delay(
          Math.min(60000, Math.max(retryAfter, 500 * 2 ** (attempt - 1) + Math.random() * 250)),
        );
      }
    }
    throw new AppError("PROVIDER_UNAVAILABLE", "Provider retry budget exhausted.");
  }
}
