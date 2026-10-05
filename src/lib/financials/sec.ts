import "server-only";
import { z } from "zod";
import { load } from "cheerio";
import { ExternalGateway } from "@/server/external";
import { getEnv } from "@/server/env";
import { AppError, safeError } from "@/lib/errors";
import {
  financialReportsSchema,
  type FinancialReportsProvider,
  type FinancialSource,
  type FilingExcerpt,
} from "@/types/financials";
import { normalizeCompanyFacts } from "./normalize";

export function extractFilingExcerpts(html: string, sourceId: string): FilingExcerpt[] {
  const $ = load(html);
  $(
    "script,style,noscript,head,[hidden],[style*='display:none'],[style*='display: none']",
  ).remove();
  const selected: FilingExcerpt[] = [];
  const seen = new Set<string>();
  $("p,div,td").each((_, element) => {
    if ($(element).children("p,div,table").length) return;
    const text = $(element).text().replace(/\s+/g, " ").trim();
    if (
      text.length < 80 ||
      text.length > 5000 ||
      seen.has(text) ||
      /forward-looking statements|table of contents/i.test(text)
    )
      return;
    const category: FilingExcerpt["category"] | null =
      /guidance|we expect|we anticipate|outlook|forecast/i.test(text)
        ? "outlook"
        : /segment|data center|datacenter|geographic/i.test(text)
          ? "segments"
          : /risk|export control|restriction|uncertain|dependen/i.test(text)
            ? "risks"
            : /revenue|margin|cash flow|operating income/i.test(text)
              ? "operations"
              : null;
    if (!category || selected.filter((excerpt) => excerpt.category === category).length >= 2)
      return;
    seen.add(text);
    selected.push({ category, text: text.slice(0, 700), sourceId, truncated: text.length > 700 });
  });
  return selected.slice(0, 8);
}
const accessionSchema = z.string().regex(/^\d{10}-\d{2}-\d{6}$/);
const filenameSchema = z.string().regex(/^[a-zA-Z0-9_.-]+\.html?$/);
export function secDocumentUrl(cik: string, accession: string, filename: string) {
  if (!/^\d{10}$/.test(cik))
    throw new AppError("MALFORMED_RESPONSE", "Invalid SEC issuer identifier.");
  accessionSchema.parse(accession);
  filenameSchema.parse(filename);
  return new URL(
    `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll("-", "")}/${filename}`,
  );
}
export function normalizeSubmissions(raw: unknown, now = new Date()) {
  const root = z
    .object({
      filings: z.object({
        recent: z.object({
          accessionNumber: z.array(z.string()),
          filingDate: z.array(z.string()),
          form: z.array(z.string()),
          primaryDocument: z.array(z.string()),
          items: z.array(z.string()).optional(),
        }),
      }),
    })
    .parse(raw);
  const recent = root.filings.recent;
  const today = now.toISOString().slice(0, 10);
  return recent.accessionNumber
    .flatMap((accession, index) => {
      const value = z
        .object({
          accession: accessionSchema,
          filedAt: z.iso.date(),
          form: z.string(),
          filename: filenameSchema,
          items: z.string(),
        })
        .safeParse({
          accession,
          filedAt: recent.filingDate[index],
          form: recent.form[index],
          filename: recent.primaryDocument[index],
          items: recent.items?.[index] ?? "",
        });
      return value.success && value.data.filedAt <= today ? [value.data] : [];
    })
    .sort((a, b) => b.filedAt.localeCompare(a.filedAt));
}
export class SecFinancialReportsProvider implements FinancialReportsProvider {
  constructor(private gateway: ExternalGateway) {}
  async getReports(symbol: string) {
    const userAgent = getEnv().SEC_USER_AGENT;
    if (!userAgent || !/[^\s@]+@[^\s@]+\.[^\s@]+/.test(userAgent))
      throw new AppError(
        "CONFIGURATION",
        "Set SEC_USER_AGENT to the application name and a real contact email to enable financial reports.",
        503,
      );
    const headers = { "User-Agent": userAgent, Accept: "application/json,text/html" };
    return this.gateway.cached(
      `financial-reports:v2:${symbol}`,
      6 * 3600000,
      "sec",
      "financial-reports",
      async () => {
        const tickers = await this.gateway.cached(
          "sec:tickers:v1",
          86400000,
          "sec",
          "issuer-index",
          async () => {
            const raw = await this.gateway.request(
              "sec",
              "issuer-index",
              new URL("https://www.sec.gov/files/company_tickers.json"),
              headers,
              { maxBytes: 5_000_000 },
            );
            return z
              .record(
                z.string(),
                z.object({ cik_str: z.number().int().positive(), ticker: z.string() }),
              )
              .parse(raw);
          },
        );
        const issuer = Object.values(tickers).find(
          (entry) => entry.ticker.toUpperCase() === symbol.replaceAll(".", "-"),
        );
        if (!issuer)
          throw new AppError("NO_SEC_ISSUER", "This ticker was not found in the SEC issuer index.");
        const cik = String(issuer.cik_str).padStart(10, "0");
        const raw = await this.gateway.request(
          "sec",
          "company-facts",
          new URL(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`),
          headers,
          { maxBytes: 15_000_000 },
        );
        const reports = normalizeCompanyFacts(raw, cik);
        try {
          const filings = normalizeSubmissions(
            await this.gateway.request(
              "sec",
              "submissions",
              new URL(`https://data.sec.gov/submissions/CIK${cik}.json`),
              headers,
            ),
          );
          const selected = [
            filings.find((filing) => /^(10-Q|6-K)$/.test(filing.form)),
            filings.find((filing) => /^(10-K|20-F|40-F)$/.test(filing.form)),
            filings.find(
              (filing) =>
                filing.form === "8-K" &&
                filing.items.split(",").some((item) => item.trim() === "2.02"),
            ),
          ].filter((filing) => !!filing);
          for (const filing of selected) {
            try {
              let url = secDocumentUrl(cik, filing.accession, filing.filename);
              let form = filing.form;
              if (form === "8-K") {
                const indexUrl = new URL("index.json", url);
                const index = z
                  .object({
                    directory: z.object({ item: z.array(z.object({ name: z.string() })) }),
                  })
                  .parse(await this.gateway.request("sec", "release-index", indexUrl, headers));
                const exhibit = index.directory.item.find(
                  (entry) =>
                    /(?:ex|exhibit)[_-]?99|99[_.-]1/i.test(entry.name) &&
                    filenameSchema.safeParse(entry.name).success,
                );
                if (!exhibit) {
                  reports.warnings.push(
                    "Latest earnings 8-K had no identifiable HTML Exhibit 99.1; the release text was not extracted.",
                  );
                  continue;
                }
                url = secDocumentUrl(cik, filing.accession, exhibit.name);
                form = "8-K earnings exhibit";
              }
              const source: FinancialSource = {
                id: `${filing.accession}:${url.pathname.split("/").at(-1)}`,
                form,
                filedAt: filing.filedAt,
                url: url.toString(),
              };
              const excerpts = await this.gateway.cached(
                `sec:excerpts:v2:${source.id}`,
                30 * 86400000,
                "sec",
                "filing-excerpts",
                async () =>
                  extractFilingExcerpts(
                    z.string().parse(
                      await this.gateway.request("sec", "filing-document", url, headers, {
                        responseType: "text",
                        maxBytes: 8_000_000,
                      }),
                    ),
                    source.id,
                  ),
              );
              if (excerpts.length) {
                reports.sources.push(source);
                reports.excerpts.push(...excerpts);
              }
            } catch (error) {
              reports.warnings.push(
                `Official filing text unavailable (${safeError(error).code}). Financial numbers remain available.`,
              );
            }
          }
        } catch (error) {
          reports.warnings.push(`Filing narrative unavailable (${safeError(error).code}).`);
        }
        // Favor current outlook/segment/risk excerpts, with representation across categories.
        reports.excerpts = [...reports.excerpts]
          .sort(
            (a, b) =>
              Number(
                b.sourceId.includes(":") &&
                  reports.sources.find((s) => s.id === b.sourceId)?.form.startsWith("8-K"),
              ) -
              Number(
                a.sourceId.includes(":") &&
                  reports.sources.find((s) => s.id === a.sourceId)?.form.startsWith("8-K"),
              ),
          )
          .filter(
            (excerpt, index, entries) =>
              entries.findIndex((other) => other.text === excerpt.text) === index,
          );
        reports.excerpts = ["outlook", "segments", "risks", "operations"].flatMap((category) =>
          reports.excerpts.filter((excerpt) => excerpt.category === category).slice(0, 2),
        );
        if (!reports.excerpts.length)
          reports.warnings.push(
            "No usable official narrative excerpts were found; guidance is unverified.",
          );
        return financialReportsSchema.parse(reports);
      },
    );
  }
}
