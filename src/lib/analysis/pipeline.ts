import { AppError, safeError } from "@/lib/errors";
import { buildAnalysisInput } from "./normalize";
import {
  decisionSchema,
  type AnalysisInput,
  type DecisionEngine,
  type EngineResult,
  type MarketDataProvider,
  type MarketHistory,
  type NewsProvider,
  type RunResult,
} from "@/types/analysis";

export type Claim =
  | { status: "claimed"; runId: string; tickerId: string }
  | { status: "skipped" | "running"; message: string };
export interface AnalysisRepository {
  claim(symbol: string, force: boolean, trigger: string, now: Date): Promise<Claim>;
  stage(runId: string, stage: string, context?: unknown, warnings?: string[]): Promise<void>;
  complete(
    claim: Extract<Claim, { status: "claimed" }>,
    input: AnalysisInput,
    output: EngineResult,
    now: Date,
    history?: MarketHistory | null,
  ): Promise<string>;
  fail(runId: string, code: string, message: string): Promise<void>;
  enabledSymbols(): Promise<string[]>;
}
export class AnalysisPipeline {
  constructor(
    private repository: AnalysisRepository,
    private providers: (
      symbol: string,
      runId: string,
    ) => { market: MarketDataProvider; news: NewsProvider; engine: DecisionEngine },
    private horizon: AnalysisInput["horizon"],
    private clock: () => Date = () => new Date(),
  ) {}
  async analyzeTicker(
    symbol: string,
    options: { force?: boolean; trigger?: string } = {},
  ): Promise<RunResult> {
    const now = this.clock();
    const claim = await this.repository.claim(
      symbol,
      options.force ?? false,
      options.trigger ?? "manual",
      now,
    );
    if (claim.status !== "claimed") return { symbol, ...claim };
    const { runId } = claim;
    try {
      const { market, news, engine } = this.providers(symbol, runId);
      await this.repository.stage(runId, "market");
      const quote = await market.getQuote(symbol);
      if (now.getTime() - new Date(quote.asOf).getTime() > 7 * 86400000)
        throw new AppError(
          "STALE_MARKET_DATA",
          "The market quote is more than seven days old. Refresh the provider data before analysis.",
        );
      await this.repository.stage(runId, "enrichment", { quote });
      const warnings: string[] = [];
      const optional = async <T>(label: string, work: () => Promise<T>): Promise<T | null> => {
        try {
          return await work();
        } catch (error) {
          const known = safeError(error);
          warnings.push(`${label} unavailable (${known.code}): ${known.message}`);
          return null;
        }
      };
      // Historical data follows the quote to respect low-cost provider allowances.
      const history = await optional("Price history", () =>
        market.getHistoricalData(symbol, "3mo"),
      );
      await this.repository.stage(runId, "news", { quote, history }, warnings);
      const [articles, fundamentals] = await Promise.all([
        optional("News", () => news.getNews(symbol)),
        optional("Fundamentals", () => market.getFundamentals(symbol)),
      ]);
      await this.repository.stage(
        runId,
        "normalization",
        { quote, history, fundamentals, articles },
        warnings,
      );
      const input = buildAnalysisInput({
        quote,
        history,
        fundamentals,
        news: articles ?? [],
        warnings,
        horizon: this.horizon,
        now,
      });
      await this.repository.stage(runId, "decision", input, input.warnings);
      const output = await engine.analyze(input);
      await this.repository.stage(runId, "validation");
      decisionSchema.parse(output.decision);
      await this.repository.stage(runId, "persistence");
      const analysisId = await this.repository.complete(claim, input, output, now, history);
      return { symbol, status: "succeeded", analysisId };
    } catch (error) {
      const known = safeError(error);
      await this.repository.fail(runId, known.code, known.message);
      console.error(
        JSON.stringify({
          event: "analysis_failed",
          symbol,
          runId,
          code: known.code,
          message: known.message,
        }),
      );
      return { symbol, status: "failed", message: known.message };
    }
  }
  async analyzeAllEnabledTickers(
    options: { force?: boolean; trigger?: string; onResult?: (result: RunResult) => void } = {},
  ) {
    const results: RunResult[] = [];
    for (const symbol of await this.repository.enabledSymbols()) {
      let result: RunResult;
      try {
        result = await this.analyzeTicker(symbol, options);
      } catch (error) {
        const known = safeError(error);
        result = { symbol, status: "failed", message: known.message };
        console.error(JSON.stringify({ event: "analysis_failed", symbol, code: known.code }));
      }
      results.push(result);
      options.onResult?.(result);
    }
    return results;
  }
}
