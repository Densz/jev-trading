import "server-only";
import { db } from "@/db/client";
import { dataMode } from "./env";
import { jsonValue } from "./external";
import { AppError } from "@/lib/errors";
import type { AnalysisRepository, Claim } from "@/lib/analysis/pipeline";
import type { AnalysisInput, EngineResult, MarketHistory } from "@/types/analysis";

export class PrismaAnalysisRepository implements AnalysisRepository {
  async claim(symbol: string, force: boolean, trigger: string, now: Date): Promise<Claim> {
    return db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`analysis:${symbol}`}))`;
      const ticker = await tx.ticker.findUnique({ where: { symbol } });
      if (!ticker || !ticker.enabled)
        throw new AppError("NOT_FOUND", "This ticker is not enabled in your watchlist.", 404);
      const mode = dataMode();
      await tx.analysisRun.updateMany({
        where: { tickerId: ticker.id, status: "RUNNING", expiresAt: { lte: now } },
        data: {
          status: "FAILED",
          errorCode: "INTERRUPTED",
          errorMessage: "The previous analysis exceeded its lease or the server was interrupted.",
          finishedAt: now,
        },
      });
      const active = await tx.analysisRun.findFirst({
        where: { tickerId: ticker.id, status: "RUNNING" },
      });
      if (active)
        return { status: "running", message: "An analysis is already running for this ticker." };
      const day = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
      if (
        !force &&
        (await tx.analysis.findFirst({
          where: { tickerId: ticker.id, dataMode: mode, analysisDay: day },
        }))
      )
        return {
          status: "skipped",
          message: "Already analyzed successfully today (UTC). Use Re-analyze to force a new run.",
        };
      const run = await tx.analysisRun.create({
        data: {
          tickerId: ticker.id,
          stage: "starting",
          trigger,
          dataMode: mode,
          startedAt: now,
          expiresAt: new Date(now.getTime() + 10 * 60000),
        },
      });
      return { status: "claimed", runId: run.id, tickerId: ticker.id };
    });
  }
  async stage(runId: string, stage: string, context?: unknown, warnings?: string[]) {
    const result = await db.analysisRun.updateMany({
      where: { id: runId, status: "RUNNING", expiresAt: { gt: new Date() } },
      data: {
        stage,
        ...(context !== undefined ? { context: jsonValue(context) } : {}),
        ...(warnings ? { warnings: jsonValue(warnings) } : {}),
      },
    });
    if (result.count !== 1)
      throw new AppError(
        "LEASE_EXPIRED",
        "This run expired or was superseded. Start a new analysis.",
        409,
      );
  }
  async complete(
    claim: Extract<Claim, { status: "claimed" }>,
    input: AnalysisInput,
    output: EngineResult,
    now: Date,
    history?: MarketHistory | null,
  ) {
    return db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`analysis:${input.ticker.symbol}`}))`;
      const finishedAt = new Date();
      const result = await tx.analysisRun.updateMany({
        where: { id: claim.runId, status: "RUNNING", expiresAt: { gt: finishedAt } },
        data: {
          status: "SUCCEEDED",
          stage: "complete",
          finishedAt,
          rawOutput: jsonValue(output.raw),
        },
      });
      if (result.count !== 1)
        throw new AppError("LEASE_EXPIRED", "This run expired. No recommendation was saved.", 409);
      const decision = output.decision;
      const analysis = await tx.analysis.create({
        data: {
          tickerId: claim.tickerId,
          runId: claim.runId,
          decision: decision.decision,
          confidence: decision.confidence,
          summary: decision.summary,
          bullishFactors: jsonValue(decision.bullishFactors),
          bearishFactors: jsonValue(decision.bearishFactors),
          risks: jsonValue(decision.risks),
          marketDataSnapshot: jsonValue({
            quote: input.market,
            signals: input.signals,
            fundamentals: input.fundamentals,
            history: history ?? null,
          }),
          newsSnapshot: jsonValue(input.news),
          analysisInput: jsonValue(input),
          engineOutput: jsonValue(output.raw),
          engine: output.engine,
          model: output.model,
          rubricVersion: input.rubricVersion,
          dataMode: dataMode(),
          analysisDay: new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`),
        },
      });
      await tx.ticker.update({
        where: { id: claim.tickerId },
        data: { name: input.ticker.name, exchange: input.ticker.exchange },
      });
      return analysis.id;
    });
  }
  async fail(runId: string, code: string, message: string) {
    await db.analysisRun.updateMany({
      where: { id: runId, status: "RUNNING" },
      data: { status: "FAILED", errorCode: code, errorMessage: message, finishedAt: new Date() },
    });
  }
  async enabledSymbols() {
    return (
      await db.ticker.findMany({
        where: { enabled: true },
        orderBy: { symbol: "asc" },
        select: { symbol: true },
      })
    ).map((t) => t.symbol);
  }
}
