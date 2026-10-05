import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptApiKey, decryptApiKey, encryptionReady } from "@/server/key-encryption";
import { AiDecisionEngine } from "@/lib/ai/analyze";
import { input, validOutput } from "./fixtures";
import type { ExternalGateway, UsageEntry } from "@/server/external";
import { analysisOptionsSchema, providerUpdateSchema, type AiProvider } from "@/lib/ai/config";

afterEach(() => vi.unstubAllEnvs());
describe("API credential encryption", () => {
  it("randomizes ciphertext and binds it to the provider", () => {
    vi.stubEnv("API_KEY_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    const secret = "fixture-secret-for-unit-tests";
    const first = encryptApiKey("openai", secret);
    expect(first).not.toContain(secret);
    expect(first).not.toEqual(encryptApiKey("openai", secret));
    expect(decryptApiKey("openai", first)).toBe(secret);
    expect(() => decryptApiKey("anthropic", first)).toThrow("cannot be decrypted");
    const parts = first.split(":");
    parts[3] = Buffer.from("modified ciphertext").toString("base64");
    expect(() => decryptApiKey("openai", parts.join(":"))).toThrow("cannot be decrypted");
    vi.stubEnv("API_KEY_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    expect(() => decryptApiKey("openai", first)).toThrow("cannot be decrypted");
  });
  it("fails closed without a valid independent encryption key", () => {
    for (const value of ["", "short", randomBytes(16).toString("base64")]) {
      vi.stubEnv("API_KEY_ENCRYPTION_KEY", value);
      expect(encryptionReady()).toBe(false);
      expect(() => encryptApiKey("deepseek", "fixture-secret")).toThrow("API_KEY_ENCRYPTION_KEY");
    }
  });
  it("rejects unsupported providers and bounded or malformed key inputs", () => {
    expect(() => analysisOptionsSchema.parse({ provider: "custom-url" })).toThrow();
    expect(() =>
      providerUpdateSchema.parse({
        provider: "openai",
        model: "https://attacker.example",
        apiKey: "test-key",
      }),
    ).toThrow();
    expect(() =>
      providerUpdateSchema.parse({
        provider: "openai",
        model: "gpt-4.1-mini",
        apiKey: "test\r\nkey",
      }),
    ).toThrow();
  });
});
describe("analysis request options", () => {
  it("combines provider selection with bounded X research options", () => {
    const options = {
      force: true,
      provider: "openai",
      tweetLimit: 20,
      includeAuthorProfiles: true,
    };
    expect(analysisOptionsSchema.parse(options)).toEqual(options);
    expect(analysisOptionsSchema.parse({})).toEqual({ force: false });
    expect(analysisOptionsSchema.parse({ provider: "jev", tweetLimit: 0 })).toEqual({
      force: false,
      provider: "jev",
      tweetLimit: 0,
    });
    for (const tweetLimit of [-1, 5, 10.5, 101, "10"])
      expect(analysisOptionsSchema.safeParse({ ...options, tweetLimit }).success).toBe(false);
    expect(
      analysisOptionsSchema.safeParse({ ...options, includeAuthorProfiles: "true" }).success,
    ).toBe(false);
    expect(analysisOptionsSchema.safeParse({ ...options, unlimited: true }).success).toBe(false);
  });
});
function fixture(provider: AiProvider, response: Response | Error) {
  const fetcher = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  const record = vi.fn<(entry: UsageEntry) => Promise<void>>().mockResolvedValue(undefined);
  const reserve = vi.fn(async () => {});
  const engine = new AiDecisionEngine({ fetcher, record, reserve } as unknown as ExternalGateway, {
    provider,
    model: "fixture-model",
    apiKey: "unit-only-secret",
  });
  return { engine, fetcher, record, reserve };
}
function chat(content = JSON.stringify(validOutput.decision), finish = "stop") {
  return new Response(
    JSON.stringify({
      model: "returned-model-version",
      choices: [{ finish_reason: finish, message: { content } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    }),
  );
}
describe("structured AI analysis", () => {
  it.each(["openai", "deepseek", "anthropic"] as const)(
    "uses the official %s endpoint and saves a validated explanation",
    async (provider) => {
      const response =
        provider === "anthropic"
          ? new Response(
              JSON.stringify({
                model: "claude-fixture",
                stop_reason: "end_turn",
                content: [{ type: "text", text: JSON.stringify(validOutput.decision) }],
                usage: { input_tokens: 100, output_tokens: 20 },
              }),
            )
          : chat();
      const { engine, fetcher, record } = fixture(provider, response);
      const result = await engine.analyze(input());
      expect(result.engine).toBe(provider);
      expect(result.decision.decision).toBe("HOLD");
      expect(result.decision.risks.join(" ")).toContain("subjective");
      expect(result.decision.risks.join(" ")).toContain("No period-specific financial reports");
      const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
      expect(new URL(url).hostname).toBe(
        provider === "anthropic" ? "api.anthropic.com" : `api.${provider}.com`,
      );
      const headers = new Headers(options.headers);
      expect(headers.get(provider === "anthropic" ? "x-api-key" : "authorization")).toBe(
        provider === "anthropic" ? "unit-only-secret" : "Bearer unit-only-secret",
      );
      expect(options.redirect).toBe("error");
      expect(String(options.body)).not.toContain("unit-only-secret");
      expect(String(options.body)).toContain("untrusted data");
      expect(JSON.stringify(result)).not.toContain("unit-only-secret");
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, inputTokens: 100, outputTokens: 20 }),
      );
      expect(record.mock.calls[0][0]).not.toHaveProperty("estimatedCostUsd");
    },
  );
  it("rejects malformed or truncated decisions while retaining billed usage", async () => {
    for (const response of [
      chat("not JSON"),
      chat(JSON.stringify({ ...validOutput.decision, confidence: 2 })),
      chat(JSON.stringify(validOutput.decision), "length"),
    ]) {
      const { engine, record, fetcher } = fixture("openai", response);
      await expect(engine.analyze(input())).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, inputTokens: 100, outputTokens: 20 }),
      );
    }
  });
  it("does not expose upstream error bodies or retry paid requests", async () => {
    const { engine, record, fetcher } = fixture(
      "deepseek",
      new Response("unit-only-secret sensitive error", { status: 401 }),
    );
    await expect(engine.analyze(input())).rejects.toMatchObject({ code: "PROVIDER_AUTH" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(record.mock.calls)).not.toContain("unit-only-secret");
  });
  it("rejects responses reflecting the credential and handles timeouts", async () => {
    const reflected = fixture(
      "openai",
      chat(JSON.stringify({ ...validOutput.decision, summary: "unit-only-secret" })),
    );
    await expect(reflected.engine.analyze(input())).rejects.toMatchObject({
      code: "MALFORMED_RESPONSE",
    });
    const timeout = fixture("anthropic", new DOMException("secret in error", "TimeoutError"));
    await expect(timeout.engine.analyze(input())).rejects.toMatchObject({ code: "TIMEOUT" });
  });
  it("rejects oversized responses and budgets inputs before making a paid call", async () => {
    const { engine } = fixture("openai", new Response("x".repeat(256001)));
    await expect(engine.analyze(input())).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
    const { engine: bounded, fetcher } = fixture("openai", chat());
    const context = input({
      ticker: { symbol: "AAPL", name: "x".repeat(201), exchange: "NASDAQ" },
    });
    await expect(bounded.analyze(context)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("tests the saved model with a small separately logged call", async () => {
    const { engine, fetcher, record } = fixture("openai", chat("OK"));
    await engine.testConnection();
    const options = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
    const body = JSON.parse(String(options.body));
    expect(body.max_completion_tokens).toBe(32);
    expect(body.response_format).toBeUndefined();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "credential-test", success: true }),
    );
  });
});
