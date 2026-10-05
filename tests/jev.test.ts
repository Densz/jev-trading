import { afterEach, describe, expect, it, vi } from "vitest";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { decisionSchema } from "@/types/analysis";
import { buildJevRequest, interpretJevResponse } from "@/lib/jev/analyze";
import { recommendationSchema } from "@/lib/jev/schema";
import { input, validOutput } from "./fixtures";
afterEach(() => vi.unstubAllEnvs());
const recommendation = {
  type: "choice",
  choice: "BUY",
  confidence: 0.7,
  probabilities: { BUY: 0.8, HOLD: 0.15, SELL: 0.05 },
};
describe("strict decision and Jev validation", () => {
  it("rejects out-of-range confidence, unknown decisions, and extra fields", () => {
    expect(() => decisionSchema.parse({ ...validOutput.decision, confidence: 82 })).toThrow();
    expect(() => decisionSchema.parse({ ...validOutput.decision, decision: "MAYBE" })).toThrow();
    expect(() => decisionSchema.parse({ ...validOutput.decision, expectedReturn: 0.8 })).toThrow();
  });
  it("checks complete distributions, highest choice, and official confidence semantics", () => {
    expect(recommendationSchema.parse(recommendation).confidence).toBe(0.7);
    expect(() =>
      recommendationSchema.parse({ ...recommendation, probabilities: { BUY: 0.8, HOLD: 0.1 } }),
    ).toThrow();
    expect(() => recommendationSchema.parse({ ...recommendation, choice: "SELL" })).toThrow();
    expect(() => recommendationSchema.parse({ ...recommendation, confidence: 0.8 })).toThrow();
  });
  it("builds actual SDK choices and uses the provider-independent input unchanged", async () => {
    vi.stubEnv("TYPESAFE_MODEL", "jev-1.13.0");
    const context = input({ evidence: [], news: [] });
    const request = buildJevRequest(context);
    const fetcher = vi.fn<typeof fetch>(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      expect(body.state).toEqual(context);
      expect(body.questions.recommendation.type).toBe("choice");
      expect(Object.keys(body.questions.recommendation.criteria)).toEqual(["HOLD", "BUY", "SELL"]);
      return new Response(
        JSON.stringify({
          model: "jev-1.13.0",
          answers: { recommendation },
          usage: { input_tokens: 500, output_tokens: 40 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = new TypeSafeClient({
      apiKey: "test-only",
      fetch: fetcher,
      retry: { maxRetries: 0 },
    });
    const response = await client.systemOne(request);
    const result = interpretJevResponse(context, response);
    expect(result.decision.decision).toBe("BUY");
    expect(result.decision.confidence).toBe(0.7);
    expect(result.decision.summary).toContain("assembled from source facts");
    expect(result.decision.summary).not.toContain("chance");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("fails closed on omitted answers and filters uncertain news factors", () => {
    const context = input({ evidence: [] });
    const raw = {
      model: "jev-1.13.0",
      answers: {
        recommendation,
        news_0: {
          type: "choice",
          choice: "BULLISH",
          confidence: 0.2,
          probabilities: { BULLISH: 0.4, BEARISH: 0.2, NEUTRAL: 0.2, IRRELEVANT: 0.2 },
        },
      },
      usage: { input_tokens: 100, output_tokens: 20 },
    };
    expect(interpretJevResponse(context, raw).decision.bullishFactors).toEqual([]);
    expect(() => interpretJevResponse(context, { ...raw, answers: { recommendation } })).toThrow(
      "exactly",
    );
  });
});
