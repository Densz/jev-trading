import type { AnalysisInput } from "@/types/analysis";
import type { FinancialPeriod } from "@/types/financials";
import { ArrowUpRight, FileText, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const compact = (value: number | null, currency: string) =>
  value === null
    ? "Unknown"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(value);
const change = (value: number | null) =>
  value === null ? "Unknown" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
const percentage = (value: number | null) => (value === null ? "Unknown" : `${value.toFixed(1)}%`);
export function CoverageNotice({
  input,
  compact: small = false,
}: {
  input: AnalysisInput;
  compact?: boolean;
}) {
  const quality = input.version === "2" ? input.dataQuality : null;
  const label =
    quality?.status === "sufficient"
      ? "Baseline covered"
      : quality?.status === "partial"
        ? "Partial coverage"
        : "Limited coverage";
  if (small)
    return (
      <span
        className={cn(
          "text-[10px]",
          quality?.status === "sufficient" ? "text-muted-foreground" : "text-neutral-signal",
        )}
      >
        {label}
      </span>
    );
  return (
    <section className="panel mb-5 p-5" aria-label="Data coverage">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <ShieldAlert className="size-4 text-neutral-signal" />
          Data coverage
        </h2>
        <span className="rounded border border-border px-2 py-1 text-[10px] text-neutral-signal">
          {label}
        </span>
      </div>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        Coverage measures the evidence available, not confidence in the classification or expected
        return.{" "}
        {quality?.status !== "sufficient" &&
          "This recommendation is provisional because important evidence is missing or incomplete."}
      </p>
      {quality ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-xs md:grid-cols-4">
            {[
              [
                "Financial periods",
                `${quality.financialPeriods.quarterly} quarterly / ${quality.financialPeriods.annual} annual`,
              ],
              ["Latest period end", quality.latestFinancialPeriodEnd ?? "Unavailable"],
              ["News selection", `${quality.newsIncluded} / ${quality.newsCandidates} candidates`],
              ["Publishers / excerpts", `${quality.newsSources} / ${quality.officialExcerpts}`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10px] text-muted-foreground">{label}</dt>
                <dd className="mt-1 font-mono">{value}</dd>
              </div>
            ))}
          </dl>
          <details className="mt-4 border-t border-border pt-3">
            <summary className="text-xs text-muted-foreground">
              Coverage limitations ({quality.limitations.length})
            </summary>
            <ul className="mt-3 space-y-2 text-xs leading-6 text-muted-foreground">
              {quality.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Legacy V1 analysis: period-specific reports and coverage were not collected. Re-analyze to
          build the richer V2 context.
        </p>
      )}
    </section>
  );
}
function PeriodTable({
  title,
  periods,
  input,
}: {
  title: string;
  periods: FinancialPeriod[];
  input: Extract<AnalysisInput, { version: "2" }>;
}) {
  const reports = input.financialReports!;
  return (
    <details className="border-t border-border" open={title === "Quarterly results"}>
      <summary className="px-5 py-4 text-xs font-medium">
        {title} <span className="ml-2 text-muted-foreground">{periods.length} periods</span>
      </summary>
      {periods.length ? (
        <div className="overflow-x-auto">
          <table className="data-table relative">
            <thead>
              <tr>
                <th>Fiscal period</th>
                <th>Revenue / YoY</th>
                <th>Gross / net margin</th>
                <th>Diluted EPS / YoY</th>
                <th>Operating cash / FCF</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => {
                const sourceId = period.provenance.revenue?.sourceIds[0];
                const source = reports.sources.find((entry) => entry.id === sourceId);
                return (
                  <tr key={period.id}>
                    <td className="whitespace-nowrap">
                      <span className="font-mono">{period.endDate}</span>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        From {period.startDate} · {period.currency}
                      </p>
                    </td>
                    <td className="whitespace-nowrap font-mono">
                      {compact(period.metrics.revenue, period.currency)}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {change(period.changes.revenueYoYPercent)} YoY
                      </p>
                    </td>
                    <td className="whitespace-nowrap font-mono">
                      {percentage(period.metrics.grossMarginPercent)} /{" "}
                      {percentage(period.metrics.netMarginPercent)}
                    </td>
                    <td className="whitespace-nowrap font-mono">
                      {period.metrics.dilutedEps === null
                        ? "Unknown"
                        : period.metrics.dilutedEps.toFixed(2)}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {change(period.changes.dilutedEpsYoYPercent)} YoY
                      </p>
                    </td>
                    <td className="whitespace-nowrap font-mono">
                      {compact(period.metrics.operatingCashFlow, period.currency)} /{" "}
                      {compact(period.metrics.freeCashFlow, period.currency)}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {period.provenance.operatingCashFlow?.method === "difference"
                          ? "Quarter derived from cumulative filings"
                          : "Reported period flows"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap">
                      {source ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary"
                        >
                          {source.form}
                          <ArrowUpRight className="size-3" />
                          <span className="sr-only">Source for period {period.endDate}</span>
                        </a>
                      ) : (
                        "Unavailable"
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground">{source?.filedAt}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 pb-5 text-xs text-muted-foreground">
          No supported standalone periods were available. Missing values are never assumed to be
          zero.
        </p>
      )}
    </details>
  );
}
export function FinancialResearch({ input }: { input: AnalysisInput }) {
  if (input.version !== "2") return null;
  const reports = input.financialReports;
  if (!reports)
    return (
      <section className="panel mb-5 p-5">
        <h2 className="text-sm font-medium">Financial statements</h2>
        <p className="mt-3 text-xs leading-6 text-muted-foreground">
          Period-specific reports were unavailable. Review the coverage limitations and pipeline
          warnings; trailing provider ratios are not a replacement.
        </p>
        {input.warnings
          .filter((warning) => warning.startsWith("Financial reports unavailable"))
          .map((warning) => (
            <p key={warning} className="mt-2 text-xs leading-6 text-neutral-signal">
              {warning}
            </p>
          ))}
      </section>
    );
  const latest = reports.quarterly[0] ?? reports.annual[0];
  return (
    <>
      <section className="panel mb-5 overflow-hidden">
        <div className="px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <FileText className="size-4 text-primary" />
            Financial statements
          </h2>
          <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
            {reports.provider} · As-reported accounting · Exact fiscal dates, not calendar-quarter
            labels. Unknown values remain unknown; YoY growth requires a comparable positive base.
          </p>
        </div>
        {latest && (
          <div className="grid grid-cols-2 gap-4 border-t border-border px-5 py-4 sm:grid-cols-4">
            {[
              ["Operating income", compact(latest.metrics.operatingIncome, latest.currency)],
              ["Net income", compact(latest.metrics.netIncome, latest.currency)],
              ["Cash & equivalents", compact(latest.metrics.cash, latest.currency)],
              [
                "Long-term debt incl. current",
                compact(latest.metrics.longTermDebt, latest.currency),
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className="mt-1 font-mono text-sm">{value}</p>
              </div>
            ))}
          </div>
        )}
        <PeriodTable title="Quarterly results" periods={reports.quarterly} input={input} />
        <PeriodTable title="Annual results" periods={reports.annual} input={input} />
        <PeriodTable
          title="Six-month cumulative results"
          periods={reports.semiannual}
          input={input}
        />
        <details className="border-t border-border px-5 py-4">
          <summary className="text-xs text-muted-foreground">
            Calculation provenance & source filings
          </summary>
          <p className="mt-3 text-[11px] leading-6 text-muted-foreground">
            Free cash flow is operating cash flow minus reported capital expenditure. Margins are
            calculated from reported profits / revenue. Quarterly flows may be derived from
            cumulative disclosures; diluted EPS is never subtracted. Selected source concepts and
            all derived methods are retained below.
          </p>
          <pre className="mt-3 max-h-72 overflow-auto rounded bg-background p-3 text-[10px] leading-5">
            {JSON.stringify(
              {
                periods: [...reports.quarterly, ...reports.annual, ...reports.semiannual].map(
                  ({ id, provenance }) => ({ id, provenance }),
                ),
                sources: reports.sources,
              },
              null,
              2,
            )}
          </pre>
        </details>
      </section>
      <section className="panel mb-5 overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-medium">Official filing excerpts</h2>
          <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
            Keyword-selected source passages, not AI-written summaries or a complete report review.
            Outlook is a management statement, not an independently verified forecast.
          </p>
        </div>
        {reports.excerpts.length ? (
          <div className="grid divide-y divide-border">
            {reports.excerpts.map((excerpt, index) => {
              const source = reports.sources.find((entry) => entry.id === excerpt.sourceId);
              return (
                <article className="p-5" key={`${excerpt.sourceId}-${index}`}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="eyebrow">{excerpt.category}</span>
                    {source && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-primary"
                      >
                        {source.form} · {source.filedAt}
                        <ArrowUpRight className="size-3" />
                      </a>
                    )}
                  </div>
                  <blockquote className="max-w-4xl border-l-2 border-primary/30 pl-4 text-xs leading-6 text-muted-foreground">
                    {excerpt.text}
                    {excerpt.truncated && " [...]"}
                  </blockquote>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="p-5 text-xs text-muted-foreground">
            No usable official text excerpts were available. Guidance and segment commentary remain
            unverified.
          </p>
        )}
      </section>
    </>
  );
}
