import { describe, expect, it, vi } from "vitest";
import { AnalysisPipeline, type AnalysisRepository, type Claim } from "@/lib/analysis/pipeline";
import type { AnalysisInput, EngineResult } from "@/types/analysis";
import type { SocialCollection } from "@/types/social";
import { AppError } from "@/lib/errors";
import { article, history, now, quote, validOutput } from "./fixtures";
import { normalizeCompanyFacts } from "@/lib/financials/normalize";
import { companyFactsFixture, fixtureCik } from "./financial-fixtures";

class MemoryRepository implements AnalysisRepository {
  active = false;
  succeededDays = new Set<string>();
  saved: AnalysisInput[] = [];
  failures: string[] = [];
  stages: string[] = [];
  async claim(_symbol: string, force: boolean, _trigger: string, date: Date): Promise<Claim> {
    if (this.active) return { status: "running", message: "Already running" };
    if (!force && this.succeededDays.has(date.toISOString().slice(0, 10)))
      return { status: "skipped", message: "Already analyzed today" };
    this.active = true;
    return { status: "claimed", runId: "run", tickerId: "ticker" };
  }
  async stage(_id: string, stage: string) {
    this.stages.push(stage);
  }
  async complete(_claim: unknown, context: AnalysisInput, _output: EngineResult, date: Date) {
    this.saved.push(context);
    this.succeededDays.add(date.toISOString().slice(0, 10));
    this.active = false;
    return "analysis";
  }
  async fail(_id: string, code: string) {
    this.failures.push(code);
    this.active = false;
  }
  async enabledSymbols() {
    return ["AAPL", "MSFT"];
  }
}
function setup() {
  const repository = new MemoryRepository();
  const providers = {
    market: {
      getQuote: vi.fn(async () => quote),
      getHistoricalData: vi.fn(async () => history),
      getFundamentals: vi.fn(async () => ({
        provider: "fixture",
        fetchedAt: now.toISOString(),
        peRatio: 30,
        epsGrowthPercent: 12,
        revenueGrowthPercent: 10,
        netMarginPercent: 20,
      })),
    },
    news: { getNews: vi.fn(async () => [article]) },
    social: {
      provider: "x" as const,
      getPosts: vi.fn(async (): Promise<SocialCollection> => ({
        fetchedCount: 0,
        fetchedAt: now.toISOString(),
        posts: [],
      })),
    },
    financials: {
      getReports: vi.fn(async () => normalizeCompanyFacts(companyFactsFixture(), fixtureCik, now)),
    },
    engine: { analyze: vi.fn(async () => validOutput) },
  };
  const pipeline = new AnalysisPipeline(
    repository,
    () => providers,
    "medium-term",
    () => now,
  );
  return { repository, providers, pipeline };
}
describe("analysis pipeline", () => {
  it("normalizes, validates, and persists the successful execution", async () => {
    const { pipeline, repository, providers } = setup();
    expect((await pipeline.analyzeTicker("AAPL")).status).toBe("succeeded");
    expect(repository.saved).toHaveLength(1);
    expect(providers.engine.analyze).toHaveBeenCalledWith(repository.saved[0]);
    expect(repository.saved[0].version).toBe("2");
    if (repository.saved[0].version === "2")
      expect(repository.saved[0].financialReports?.quarterly).toHaveLength(8);
    expect(repository.stages).toEqual([
      "market",
      "enrichment",
      "news",
      "financial-reports",
      "normalization",
      "decision",
      "validation",
      "persistence",
    ]);
  });
  it("skips a second successful daily run and supports explicit force", async () => {
    const { pipeline, repository, providers } = setup();
    await pipeline.analyzeTicker("AAPL");
    expect((await pipeline.analyzeTicker("AAPL")).status).toBe("skipped");
    expect(providers.engine.analyze).toHaveBeenCalledOnce();
    expect((await pipeline.analyzeTicker("AAPL", { force: true })).status).toBe("succeeded");
    expect(repository.saved).toHaveLength(2);
  });
  it("defaults to 10 X posts, carries per-analysis overrides, and performs no collection when disabled", async () => {
    const { pipeline, providers, repository } = setup();
    await pipeline.analyzeTicker("AAPL");
    expect(providers.social.getPosts).toHaveBeenCalledWith("AAPL", "Apple Inc.", 10);
    await pipeline.analyzeTicker("AAPL", { force: true, tweetLimit: 20 });
    expect(providers.social.getPosts).toHaveBeenLastCalledWith("AAPL", "Apple Inc.", 20);
    await pipeline.analyzeTicker("AAPL", { force: true, tweetLimit: 0 });
    expect(providers.social.getPosts).toHaveBeenCalledTimes(2);
    const saved = repository.saved[2];
    if (saved.version === "2")
      expect(saved.social).toMatchObject({ status: "disabled", requestedLimit: 0, posts: [] });
  });
  it("keeps an X outage optional and explicit without inflating verified news coverage", async () => {
    const { pipeline, providers, repository } = setup();
    providers.social.getPosts.mockRejectedValue(
      new AppError("PROVIDER_UNAVAILABLE", "X unavailable"),
    );
    expect((await pipeline.analyzeTicker("AAPL")).status).toBe("succeeded");
    const saved = repository.saved[0];
    if (saved.version === "2") {
      expect(saved.social).toMatchObject({ status: "unavailable", requestedLimit: 10, posts: [] });
      expect(saved.warnings.join(" ")).toContain("X unavailable");
      expect(saved.dataQuality.newsIncluded).toBe(saved.news.length);
    }
  });
  it("enables author lookups only on request and preserves profile metadata in the saved snapshot", async () => {
    const { pipeline, providers, repository } = setup();
    const author = {
      id: "50",
      username: "analyst",
      name: "Analyst",
      description: "Self-reported bio",
      createdAt: null,
      website: null,
      followers: 100,
      fetchedAt: now.toISOString(),
    };
    providers.social.getPosts.mockResolvedValue({
      fetchedCount: 0,
      fetchedAt: now.toISOString(),
      posts: [],
      authors: [author],
      authorProfilesMessage: "Some profiles unavailable.",
    });
    await pipeline.analyzeTicker("AAPL", { includeAuthorProfiles: true });
    expect(providers.social.getPosts).toHaveBeenCalledWith("AAPL", "Apple Inc.", 10, {
      includeAuthorProfiles: true,
    });
    const saved = repository.saved[0];
    if (saved.version === "2") {
      expect(saved.social?.authors).toEqual([author]);
      expect(saved.social?.authorProfilesMessage).toBe("Some profiles unavailable.");
    }
  });
  it("blocks overlapping manual calls even when forced", async () => {
    const { pipeline, providers } = setup();
    let release!: () => void;
    providers.engine.analyze.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return validOutput;
    });
    const first = pipeline.analyzeTicker("AAPL");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    expect((await pipeline.analyzeTicker("AAPL", { force: true })).status).toBe("running");
    release();
    expect((await first).status).toBe("succeeded");
  });
  it("records partial data failures as warnings, not fabricated facts", async () => {
    const { pipeline, providers, repository } = setup();
    providers.news.getNews.mockRejectedValue(new AppError("TIMEOUT", "News timeout"));
    providers.market.getHistoricalData.mockRejectedValue(
      new AppError("RATE_LIMITED", "History rate limited"),
    );
    expect((await pipeline.analyzeTicker("AAPL")).status).toBe("succeeded");
    expect(repository.saved[0].news).toEqual([]);
    expect(repository.saved[0].signals.movingAverage50).toBeNull();
    expect(repository.saved[0].warnings.join(" ")).toContain("TIMEOUT");
  });
  it("keeps a financial-provider failure explicit without inventing statements or financial confidence", async () => {
    const { pipeline, providers, repository } = setup();
    providers.financials.getReports.mockRejectedValue(
      new AppError("CONFIGURATION", "SEC contact missing"),
    );
    expect((await pipeline.analyzeTicker("AAPL")).status).toBe("succeeded");
    const context = repository.saved[0];
    expect(context.warnings.join(" ")).toContain("CONFIGURATION");
    if (context.version === "2") {
      expect(context.financialReports).toBeNull();
      expect(context.dataQuality.status).toBe("limited");
    }
  });
  it("never saves a recommendation for market, engine, or validation failures", async () => {
    for (const failure of ["market", "engine", "validation"] as const) {
      const { pipeline, providers, repository } = setup();
      if (failure === "market")
        providers.market.getQuote.mockRejectedValue(new AppError("UNKNOWN_TICKER", "No ticker"));
      if (failure === "engine")
        providers.engine.analyze.mockRejectedValue(
          new AppError("ENGINE_UNAVAILABLE", "Jev unavailable"),
        );
      if (failure === "validation")
        providers.engine.analyze.mockResolvedValue({
          ...validOutput,
          decision: { ...validOutput.decision, confidence: 2 },
        });
      expect((await pipeline.analyzeTicker("AAPL")).status).toBe("failed");
      expect(repository.saved).toEqual([]);
      expect(repository.failures).toHaveLength(1);
      if (failure === "market") expect(providers.engine.analyze).not.toHaveBeenCalled();
    }
  });
  it("rejects a stale quote and lets a failed ticker retry the same day", async () => {
    const { pipeline, providers, repository } = setup();
    providers.market.getQuote.mockResolvedValueOnce({ ...quote, asOf: "2026-09-01T00:00:00Z" });
    expect((await pipeline.analyzeTicker("AAPL")).status).toBe("failed");
    expect(repository.failures).toContain("STALE_MARKET_DATA");
    expect((await pipeline.analyzeTicker("AAPL")).status).toBe("succeeded");
  });
  it("continues independently after a ticker fails in a daily batch", async () => {
    const { pipeline, providers, repository } = setup();
    providers.market.getQuote.mockRejectedValueOnce(
      new AppError("PROVIDER_UNAVAILABLE", "Unavailable"),
    );
    const results = await pipeline.analyzeAllEnabledTickers();
    expect(results.map((r) => r.status)).toEqual(["failed", "succeeded"]);
    expect(repository.saved).toHaveLength(1);
  });
});
