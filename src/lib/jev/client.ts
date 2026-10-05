import "server-only";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { getEnv, requireKey } from "@/server/env";

export function createJevClient(fetcher?: typeof fetch) {
  return new TypeSafeClient({
    apiKey: requireKey("TYPESAFE_API_KEY"),
    defaultModel: getEnv().TYPESAFE_MODEL,
    timeout: 15000,
    retry: { maxRetries: 0 },
    logLevel: "warn",
    fetch: fetcher,
  });
}
