import "server-only";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { getEnv, requireKey } from "@/server/env";

export function createJevClient(
  fetcher?: typeof fetch,
  configuration?: { apiKey: string; model: string },
) {
  return new TypeSafeClient({
    apiKey: configuration?.apiKey ?? requireKey("TYPESAFE_API_KEY"),
    defaultModel: configuration?.model ?? getEnv().TYPESAFE_MODEL,
    timeout: 15000,
    retry: { maxRetries: 0 },
    logLevel: "warn",
    fetch: fetcher,
  });
}
