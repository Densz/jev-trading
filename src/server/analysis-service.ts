import "server-only";
import { AnalysisPipeline } from "@/lib/analysis/pipeline";
import { PrismaAnalysisRepository } from "./analysis-repository";
import { createProviders } from "./providers";
import { getEnv } from "./env";
import { getEngineConfiguration } from "./ai-settings";
import type { AiProvider } from "@/lib/ai/config";
export async function analysisService(provider?: AiProvider) {
  // Snapshot the configuration once per batch; never put credentials in run context.
  const configuration = getEnv().DEMO_MODE ? undefined : await getEngineConfiguration(provider);
  return new AnalysisPipeline(
    new PrismaAnalysisRepository(
      configuration && { engine: configuration.provider, model: configuration.model },
    ),
    (symbol, runId) => createProviders(symbol, runId, configuration),
    getEnv().INVESTMENT_HORIZON,
    undefined,
    getEnv().X_DEFAULT_TWEET_LIMIT,
  );
}
export const analyzeAllEnabledTickers = async () =>
  (await analysisService()).analyzeAllEnabledTickers({ trigger: "daily" });
