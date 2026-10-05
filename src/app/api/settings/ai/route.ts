import { errorResponse, readBody } from "@/server/http";
import {
  deleteProvider,
  getAiSettings,
  getEngineConfiguration,
  saveProvider,
  setDefaultProvider,
} from "@/server/ai-settings";
import { providerSelectionSchema } from "@/lib/ai/config";
import { AiDecisionEngine } from "@/lib/ai/analyze";
import { ExternalGateway } from "@/server/external";
import { AppError } from "@/lib/errors";
import { getEnv } from "@/server/env";
import { createJevClient } from "@/lib/jev/client";
import { choice } from "@typesafe-ai/sdk";
import { choiceAnswerSchema, envelopeSchema } from "@/lib/jev/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const json = (value: unknown) => Response.json(value, { headers: { "Cache-Control": "no-store" } });
export async function GET() {
  try {
    return json(await getAiSettings());
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(request: Request) {
  try {
    await saveProvider(await readBody(request));
    return json(await getAiSettings());
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    await setDefaultProvider(providerSelectionSchema.parse(await readBody(request)).provider);
    return json(await getAiSettings());
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request) {
  try {
    await deleteProvider(providerSelectionSchema.parse(await readBody(request)).provider);
    return json(await getAiSettings());
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const { provider } = providerSelectionSchema.parse(await readBody(request));
    if (getEnv().DEMO_MODE)
      throw new AppError(
        "DEMO_MODE",
        "Credential tests are disabled in demo mode; no external APIs are called.",
        400,
      );
    if ((getEnv().APP_PASSWORD?.length ?? 0) < 16)
      throw new AppError(
        "CONFIGURATION",
        "Set APP_PASSWORD to at least 16 characters before testing keys.",
        503,
      );
    const configuration = await getEngineConfiguration(provider);
    const gateway = new ExternalGateway("SETTINGS");
    if (provider === "jev") {
      const started = Date.now();
      let recorded = false;
      try {
        await gateway.reserve(provider);
        const raw = await createJevClient(gateway.fetcher, configuration).systemOne(
          {
            model: configuration.model,
            state: { test: true },
            questions: {
              connection: choice("Is this a connection test?", {
                YES: "This is a connection test.",
                NO: "This is not a test.",
              }),
            },
          },
          { signal: AbortSignal.timeout(20000) },
        );
        const validated = envelopeSchema.safeParse(raw);
        if (!validated.success || JSON.stringify(raw).includes(configuration.apiKey))
          throw new AppError(
            "MALFORMED_RESPONSE",
            "Jev returned an invalid connection-test response.",
            502,
          );
        const response = validated.data;
        const answer = choiceAnswerSchema(["YES", "NO"]).safeParse(response.answers.connection);
        await gateway.record({
          provider,
          operation: "credential-test",
          cached: false,
          success: answer.success,
          attempt: 1,
          durationMs: Date.now() - started,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          estimatedCostUsd:
            (response.usage.input_tokens / 1e6) * getEnv().JEV_INPUT_USD_PER_MILLION,
          ...(!answer.success ? { errorCode: "MALFORMED_RESPONSE" } : {}),
        });
        recorded = true;
        if (!answer.success)
          throw new AppError(
            "MALFORMED_RESPONSE",
            "Jev returned an invalid connection-test response.",
            502,
          );
      } catch (error) {
        if (!recorded)
          await gateway.record({
            provider,
            operation: "credential-test",
            cached: false,
            success: false,
            attempt: 1,
            durationMs: Date.now() - started,
            errorCode: error instanceof AppError ? error.code : "PROVIDER_AUTH",
          });
        if (error instanceof AppError) throw error;
        throw new AppError(
          "PROVIDER_AUTH",
          "Jev could not validate the saved key and model. Check account permissions and availability.",
          502,
        );
      }
    } else await new AiDecisionEngine(gateway, configuration).testConnection();
    return json({ success: true, message: "The saved API key and model are available." });
  } catch (error) {
    return errorResponse(error);
  }
}
