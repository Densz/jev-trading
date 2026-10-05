import { describe, expect, it, vi, afterEach } from "vitest";
import { normalizeCompanyFacts } from "@/lib/financials/normalize";
import {
  extractFilingExcerpts,
  normalizeSubmissions,
  secDocumentUrl,
  SecFinancialReportsProvider,
} from "@/lib/financials/sec";
import { assessDataQuality, buildAnalysisInput } from "@/lib/analysis/normalize";
import { analysisInputSchema } from "@/types/analysis";
import { buildJevRequest } from "@/lib/jev/analyze";
import { ExternalGateway } from "@/server/external";
import {
  companyFactsFixture,
  fixtureCik,
  submissionsFixture,
  filingHtmlFixture,
} from "./financial-fixtures";
import { now, quote, history, article, input } from "./fixtures";
afterEach(() => vi.unstubAllEnvs());
describe("period-specific financial statements", () => {
  it("selects bounded fiscal periods, computes comparisons, and retains source provenance", () => {
    const reports = normalizeCompanyFacts(companyFactsFixture(), fixtureCik, now);
    expect(reports.quarterly).toHaveLength(8);
    expect(reports.annual).toHaveLength(3);
    expect(reports.semiannual).toHaveLength(2);
    const latest = reports.quarterly[0];
    expect(latest.startDate).toBe("2026-04-01");
    expect(latest.endDate).toBe("2026-06-30");
    expect(latest.metrics.revenue).toBe(170);
    expect(latest.changes.revenueYoYPercent).toBeCloseTo((170 / 150 - 1) * 100);
    expect(latest.metrics.grossMarginPercent).toBeCloseTo(60);
    expect(latest.metrics.longTermDebt).toBe(100);
    expect(
      reports.sources.every((source) => source.url.includes("/Archives/edgar/data/1234567/")),
    ).toBe(true);
  });
  it("derives standalone quarterly cash flow and Q4 revenue, never subtracting EPS", () => {
    const reports = normalizeCompanyFacts(companyFactsFixture(), fixtureCik, now);
    expect(reports.quarterly[0].metrics.operatingCashFlow).toBeCloseTo(42.5);
    expect(reports.quarterly[0].metrics.freeCashFlow).toBeCloseTo(34);
    expect(reports.quarterly[0].provenance.operatingCashFlow.method).toBe("difference");
    expect(reports.quarterly[0].provenance.operatingCashFlow.sourceIds.length).toBe(2);
    const fourth = reports.quarterly.find((period) => period.endDate === "2025-12-31")!;
    expect(fourth.metrics.revenue).toBe(160);
    expect(fourth.provenance.revenue.method).toBe("difference");
    expect(fourth.metrics.dilutedEps).toBeNull();
  });
  it("keeps currency units separate, excludes future disclosures, and prefers reported restatements", () => {
    const raw = companyFactsFixture();
    const revenue = raw.facts["us-gaap"].RevenueFromContractWithCustomerExcludingAssessedTax.units;
    revenue.EUR = [
      {
        start: "2026-04-01",
        end: "2026-06-30",
        val: 999,
        accn: "0001234567-26-000100",
        filed: "2026-08-04",
        form: "10-Q",
      },
    ];
    revenue.USD.push({
      start: "2026-04-01",
      end: "2026-06-30",
      val: 175,
      accn: "0001234567-26-000101",
      filed: "2026-09-01",
      form: "10-Q/A",
    });
    revenue.USD.push({
      start: "2026-04-01",
      end: "2026-06-30",
      val: 9999,
      accn: "0001234567-27-000001",
      filed: "2027-01-01",
      form: "10-Q/A",
    });
    const reports = normalizeCompanyFacts(raw, fixtureCik, now);
    expect(reports.quarterly[0].currency).toBe("USD");
    expect(reports.quarterly[0].metrics.revenue).toBe(175);
    expect(reports.sources.some((source) => source.filedAt > "2026-10-05")).toBe(false);
  });
  it("rejects issuer mismatch, empty financial facts, and does not invent zero cash flow", () => {
    expect(() => normalizeCompanyFacts(companyFactsFixture(), "0009999999", now)).toThrow(
      "another issuer",
    );
    expect(() =>
      normalizeCompanyFacts({ cik: Number(fixtureCik), facts: {} }, fixtureCik, now),
    ).toThrow("revenue");
    const raw = companyFactsFixture();
    delete raw.facts["us-gaap"].NetCashProvidedByUsedInOperatingActivities;
    const reports = normalizeCompanyFacts(raw, fixtureCik, now);
    expect(reports.quarterly[0].metrics.operatingCashFlow).toBeNull();
    expect(reports.quarterly[0].metrics.freeCashFlow).toBeNull();
  });
  it("makes sparse coverage explicit and preserves old AnalysisInput versions", () => {
    const limited = assessDataQuality(null, [article], 1, now);
    expect(limited.status).toBe("limited");
    expect(limited.limitations.join(" ")).toContain("sparse");
    const context = input();
    const legacy = analysisInputSchema.parse({
      ...context,
      version: "1",
      rubricVersion: "thesis-v1",
    });
    expect(legacy.version).toBe("1");
    expect("dataQuality" in legacy).toBe(false);
    const reports = normalizeCompanyFacts(companyFactsFixture(), fixtureCik, now);
    const rich = buildAnalysisInput({
      quote,
      history,
      fundamentals: null,
      financialReports: reports,
      news: [article],
      warnings: [],
      horizon: "medium-term",
      now,
    });
    expect(rich.version).toBe("2");
    expect(
      rich.evidence.some((entry) => entry.id === "quarterly-revenue" && entry.sourceRefs?.length),
    ).toBe(true);
    expect(JSON.stringify(buildJevRequest(rich).state).length).toBeLessThan(64000);
  });
  it("marks only the documented evidence baseline sufficient and flags stale reporting", () => {
    const reports = normalizeCompanyFacts(companyFactsFixture(), fixtureCik, now);
    reports.excerpts = [
      {
        category: "outlook",
        sourceId: reports.sources[0].id,
        text: "Official outlook excerpt",
        truncated: false,
      },
    ];
    const news = [
      article,
      { ...article, source: "Second publisher" },
      { ...article, source: "Third publisher" },
    ];
    expect(assessDataQuality(reports, news, 3, now).status).toBe("sufficient");
    const opinions = news.map((entry) => ({
      ...entry,
      title: "Should you buy this stock before earnings?",
    }));
    expect(assessDataQuality(reports, opinions, 3, now).status).toBe("partial");
    const stale = assessDataQuality(reports, news, 3, new Date("2027-10-05T12:00:00Z"));
    expect(stale.status).toBe("partial");
    expect(stale.limitations.join(" ")).toContain("150 days");
  });
  it("fits a fully populated research context within the bounded input budget", () => {
    const reports = normalizeCompanyFacts(companyFactsFixture(), fixtureCik, now);
    reports.excerpts = Array.from({ length: 8 }, (_, index) => ({
      category: index % 2 ? ("risks" as const) : ("outlook" as const),
      sourceId: reports.sources[index].id,
      text: "Official passage about operations and business risks. ".repeat(15).slice(0, 700),
      truncated: true,
    }));
    const news = Array.from({ length: 12 }, (_, index) => ({
      ...article,
      title: `Distinct${index} event${index} earnings${index}`,
      url: `https://example.com/news?id=${index}`,
      summary: "Reported company-specific development and context. ".repeat(25).slice(0, 1000),
    }));
    const context = buildAnalysisInput({
      quote,
      history,
      fundamentals: null,
      financialReports: reports,
      news,
      warnings: [],
      horizon: "medium-term",
      now,
    });
    expect(context.news).toHaveLength(12);
    expect(() => buildJevRequest(context)).not.toThrow();
    expect(JSON.stringify(context).length).toBeLessThan(64000);
  });
});
describe("official source excerpts", () => {
  it("extracts attributed bounded passages without executing HTML or inventing guidance", () => {
    const result = extractFilingExcerpts(filingHtmlFixture, "source");
    expect(result.map((excerpt) => excerpt.category)).toEqual([
      "outlook",
      "segments",
      "risks",
      "operations",
    ]);
    expect(
      result.every((excerpt) => excerpt.sourceId === "source" && excerpt.text.length <= 700),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain("alert");
    expect(extractFilingExcerpts("<p>Nothing relevant.</p>", "source")).toEqual([]);
  });
  it("accepts only SEC document paths and valid as-of filings", () => {
    expect(secDocumentUrl(fixtureCik, "0001234567-26-000001", "report.htm").hostname).toBe(
      "www.sec.gov",
    );
    expect(() =>
      secDocumentUrl(fixtureCik, "0001234567-26-000001", "../../attacker.htm"),
    ).toThrow();
    expect(normalizeSubmissions(submissionsFixture, now)).toHaveLength(3);
  });
  it("fails explicitly without a declared SEC contact before any network operation", async () => {
    vi.stubEnv("SEC_USER_AGENT", "");
    const fetcher = vi.fn();
    await expect(
      new SecFinancialReportsProvider(new ExternalGateway("NVDA", undefined, fetcher)).getReports(
        "NVDA",
      ),
    ).rejects.toThrow("SEC_USER_AGENT");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
