import "server-only";
import { AnalysisPipeline } from "@/lib/analysis/pipeline";
import { PrismaAnalysisRepository } from "./analysis-repository";
import { createProviders } from "./providers";
import { getEnv } from "./env";
export function analysisService() {
  return new AnalysisPipeline(
    new PrismaAnalysisRepository(),
    createProviders,
    getEnv().INVESTMENT_HORIZON,
  );
}
export const analyzeAllEnabledTickers = () =>
  analysisService().analyzeAllEnabledTickers({ trigger: "daily" });
