import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  Database,
  Minus,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { getTickerHistory } from "@/server/queries";
import { symbolSchema } from "@/types/analysis";
import { money, percent, relativeTime, cn } from "@/lib/utils";
import { DecisionBadge } from "@/components/decision-badge";
import { HistoryChart } from "@/components/history-chart";
import { TickerAnalyze } from "@/components/analysis-actions";
import { RunPolling } from "@/components/run-polling";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  return { title: (await params).symbol.toUpperCase() };
}
export default async function TickerPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ analysis?: string }>;
}) {
  const parsed = symbolSchema.safeParse((await params).symbol);
  if (!parsed.success) notFound();
  const data = await getTickerHistory(parsed.data);
  if (!data) notFound();
  const selectedId = (await searchParams).analysis;
  const latest = data.analyses[0];
  const selected = selectedId ? data.analyses.find((a) => a.id === selectedId) : latest;
  if (selectedId && !selected) notFound();
  const active = data.runs.some((r) => r.status === "RUNNING");
  const quote = selected?.input.market;
  const signals = selected?.input.signals;
  return (
    <>
      <RunPolling active={active} />
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to watchlist
      </Link>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title font-mono">{data.ticker.symbol}</h1>
            <span className="rounded border border-border px-2 py-1 text-[10px] text-muted-foreground">
              {data.ticker.exchange}
            </span>
            {!data.ticker.enabled && (
              <span className="text-xs text-muted-foreground">Disabled</span>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{data.ticker.name}</p>
        </div>
        <TickerAnalyze
          symbol={data.ticker.symbol}
          hasAnalysis={!!latest}
          enabled={data.ticker.enabled}
          running={active}
        />
      </div>
      {selectedId && selected && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-signal/25 bg-neutral-signal/5 p-3 text-xs text-neutral-signal">
          <span>
            Viewing saved analysis from{" "}
            {new Date(selected.createdAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC.
          </span>
          <Link href={`/tickers/${data.ticker.symbol}`} className="underline underline-offset-4">
            Return to latest
          </Link>
        </div>
      )}
      {data.runs[0] && ["FAILED", "INTERRUPTED"].includes(data.runs[0].status) && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-negative/20 bg-negative/5 p-4 text-xs leading-6 text-negative"
        >
          Last attempt failed at the {data.runs[0].stage} stage:{" "}
          {data.runs[0].errorMessage ?? "The run was interrupted."}{" "}
          {latest
            ? "The prior successful analysis is shown below."
            : "No recommendation has been produced."}
        </div>
      )}
      {selected ? (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <div className="panel p-5">
              <p className="eyebrow">Snapshot price</p>
              <p className="mt-3 font-mono text-3xl tracking-tight">
                {money(quote!.price, quote!.currency)}
              </p>
              <p
                className={cn(
                  "mt-2 font-mono text-xs",
                  quote!.changePercent >= 0 ? "text-positive" : "text-negative",
                )}
              >
                {percent(quote!.changePercent)}{" "}
                <span className="font-sans text-muted-foreground">daily change</span>
              </p>
              <p className="mt-3 text-[10px] text-muted-foreground">
                {quote!.provider} · as of{" "}
                {new Date(quote!.asOf).toLocaleString("en-US", { timeZone: "UTC" })} UTC
              </p>
            </div>
            <div className="panel p-5">
              <p className="eyebrow">Recommendation</p>
              <div className="mt-4">
                <DecisionBadge decision={selected.decision} large />
              </div>
              <p className="mt-4 text-[11px] text-muted-foreground">
                {selected.input.horizon} investment horizon
              </p>
            </div>
            <div className="panel p-5">
              <p className="eyebrow">Classification confidence</p>
              <p className="mt-3 font-mono text-3xl tracking-tight">
                {Math.round(selected.confidence * 100)}
                <span className="text-xl text-muted-foreground">%</span>
              </p>
              <div className="mt-3 h-1.5 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${selected.confidence * 100}%` }}
                />
              </div>
              <p className="mt-3 text-[10px] leading-5 text-muted-foreground">
                Confidence in {selected.decision} given the available information. Not a probability
                of a price increase.
              </p>
            </div>
          </div>
          <section className="panel mb-5 p-5 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium">The investment thesis</h2>
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Clock3 className="size-3" />
                Analyzed{" "}
                {new Date(selected.createdAt).toLocaleString("en-US", {
                  timeZone: "UTC",
                })}{" "}
                UTC
              </span>
            </div>
            <p className="max-w-4xl text-sm leading-7 text-muted-foreground">{selected.summary}</p>
            <p className="mt-4 text-[10px] text-muted-foreground">
              {selected.engine === "demo"
                ? "Synthetic demonstration result"
                : "Jev classification · source-grounded explanation assembled in code"}{" "}
              · {selected.model} · {selected.input.rubricVersion}
            </p>
          </section>
          <div className="mb-5 grid items-start gap-4 xl:grid-cols-3">
            {[
              {
                title: "Bullish factors",
                factors: selected.bullishFactors,
                icon: TrendingUp,
                color: "text-positive",
                empty: "No high-confidence material bullish factors were identified.",
              },
              {
                title: "Bearish factors",
                factors: selected.bearishFactors,
                icon: TrendingDown,
                color: "text-negative",
                empty: "No high-confidence material bearish factors were identified.",
              },
              {
                title: "Risks & uncertainty",
                factors: selected.risks,
                icon: ShieldAlert,
                color: "text-neutral-signal",
                empty: "Review your own risk tolerance and the original sources.",
              },
            ].map(({ title, factors, icon: Icon, color, empty }) => (
              <section className="panel h-full p-5" key={title}>
                <h2 className="mb-4 flex items-center gap-2 text-sm font-medium">
                  <Icon className={cn("size-4", color)} />
                  {title}
                </h2>
                {factors.length ? (
                  <ul className="space-y-3">
                    {factors.map((factor, i) => (
                      <li
                        key={`${factor}-${i}`}
                        className="flex gap-2 text-xs leading-6 text-muted-foreground"
                      >
                        <Minus className={cn("mt-2 size-3 shrink-0", color)} />
                        <span>{factor}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs leading-6 text-muted-foreground">{empty}</p>
                )}
              </section>
            ))}
          </div>
          <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="panel p-5">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium">Recommendation evolution</h2>
                <span className="text-[10px] text-muted-foreground">
                  Last {data.analyses.length} saved analyses
                </span>
              </div>
              <HistoryChart analyses={data.analyses} />
            </section>
            <section className="panel p-5">
              <h2 className="mb-5 flex items-center gap-2 text-sm font-medium">
                <Database className="size-4 text-primary" />
                Data considered
              </h2>
              <dl className="space-y-3 text-xs">
                {[
                  [
                    "Monthly change",
                    signals!.monthlyChangePercent == null
                      ? "Unavailable"
                      : percent(signals!.monthlyChangePercent),
                  ],
                  [
                    "Weekly change",
                    signals!.weeklyChangePercent == null
                      ? "Unavailable"
                      : percent(signals!.weeklyChangePercent),
                  ],
                  [
                    "50-session average",
                    signals!.movingAverage50 == null
                      ? "Unavailable"
                      : money(signals!.movingAverage50, quote!.currency),
                  ],
                  [
                    "Annualized volatility",
                    signals!.annualizedVolatilityPercent == null
                      ? "Unavailable"
                      : `${signals!.annualizedVolatilityPercent.toFixed(1)}%`,
                  ],
                  [
                    "Trailing P/E",
                    selected.input.fundamentals?.peRatio?.toFixed(1) ?? "Unavailable",
                  ],
                  ["Recent articles", `${selected.input.news.length} / 8 maximum`],
                ].map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{key}</dt>
                    <dd className="font-mono text-[11px]">{value}</dd>
                  </div>
                ))}
              </dl>
              {selected.input.warnings.length ? (
                <p className="mt-5 border-t border-border pt-4 text-[10px] leading-5 text-neutral-signal">
                  {selected.input.warnings.length} data-quality warning(s). See risks and the
                  normalized input.
                </p>
              ) : (
                <p className="mt-5 flex items-center gap-1.5 border-t border-border pt-4 text-[10px] text-muted-foreground">
                  <Check className="size-3 text-primary" />
                  Required market data validated
                </p>
              )}
            </section>
          </div>
          <section className="panel mb-5 overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-medium">News included in this analysis</h2>
            </div>
            {selected.input.news.length ? (
              <div className="divide-y divide-border">
                {selected.input.news.map((n) => (
                  <a
                    href={n.url}
                    key={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start justify-between gap-5 px-5 py-4 hover:bg-muted/30"
                  >
                    <div>
                      <h3 className="text-xs font-medium leading-6">{n.title}</h3>
                      {n.summary && (
                        <p className="mt-1 max-w-4xl text-[11px] leading-6 text-muted-foreground">
                          {n.summary}
                        </p>
                      )}
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        {n.source} ·{" "}
                        {new Date(n.publishedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC
                      </p>
                    </div>
                    <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="p-5 text-xs text-muted-foreground">
                No recent relevant news was available. This limitation was included in the decision
                context.
              </p>
            )}
          </section>
        </>
      ) : (
        <div className="panel mb-6 py-16 text-center">
          {data.quote && (
            <div className="mb-7">
              <p className="eyebrow">Latest available quote</p>
              <p className="mt-3 font-mono text-3xl">
                {money(data.quote.price, data.quote.currency)}
              </p>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {data.quote.provider} · as of {new Date(data.quote.asOf).toISOString()}
              </p>
            </div>
          )}
          <h2 className="text-lg font-medium">No analysis yet.</h2>
          <p className="mt-3 text-xs text-muted-foreground">
            Run an analysis to build the investment thesis and begin your recommendation history.
          </p>
        </div>
      )}
      <section className="panel mb-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-medium">Saved analysis history</h2>
          <span className="text-[10px] text-muted-foreground">Newest first · UTC</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Analysis date</th>
                <th>Decision</th>
                <th>Confidence</th>
                <th>Engine / model</th>
                <th>
                  <span className="sr-only">View</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.analyses.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">
                    <Link
                      href={`/tickers/${data.ticker.symbol}?analysis=${a.id}`}
                      className="hover:text-primary"
                    >
                      {new Date(a.createdAt).toLocaleString("en-US", { timeZone: "UTC" })}
                    </Link>
                  </td>
                  <td>
                    <DecisionBadge decision={a.decision} />
                  </td>
                  <td className="font-mono">{Math.round(a.confidence * 100)}%</td>
                  <td className="text-muted-foreground">{a.model}</td>
                  <td>
                    <Link
                      href={`/tickers/${data.ticker.symbol}?analysis=${a.id}`}
                      aria-label={`View analysis ${a.id}`}
                    >
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.analyses.length && (
            <p className="p-5 text-xs text-muted-foreground">No saved analyses.</p>
          )}
        </div>
      </section>
      {selected && (
        <details className="panel mb-5 p-5">
          <summary className="text-xs font-medium">
            Inspect normalized input & engine output
          </summary>
          <p className="mt-3 text-[11px] text-muted-foreground">
            This is the exact provider-independent context used for this decision and the raw engine
            response. It can be reused to compare engines.
          </p>
          <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-2">
            <div className="min-w-0">
              <p className="eyebrow mb-2">AnalysisInput</p>
              <pre className="max-h-96 overflow-auto rounded-md bg-background p-4 text-[10px] leading-5">
                {JSON.stringify(selected.input, null, 2)}
              </pre>
            </div>
            <div className="min-w-0">
              <p className="eyebrow mb-2">Engine response</p>
              <pre className="max-h-96 overflow-auto rounded-md bg-background p-4 text-[10px] leading-5">
                {JSON.stringify(selected.raw, null, 2)}
              </pre>
            </div>
          </div>
          <details className="mt-4 rounded-md border border-border p-3">
            <summary className="text-[11px] text-muted-foreground">
              Market snapshot & source price history
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-background p-4 text-[10px] leading-5">
              {JSON.stringify(selected.marketSnapshot, null, 2)}
            </pre>
          </details>
        </details>
      )}
      {data.runs.length > 0 && (
        <details className="panel p-5">
          <summary className="text-xs font-medium">Recent pipeline runs</summary>
          <div className="mt-4 space-y-3">
            {data.runs.map((run) => (
              <div
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 text-[11px] last:border-0"
              >
                <span className="text-muted-foreground">
                  {relativeTime(run.startedAt)} · {run.stage}
                </span>
                <span
                  className={
                    run.status === "FAILED" || run.status === "INTERRUPTED"
                      ? "text-negative"
                      : "text-primary"
                  }
                >
                  {run.status}
                </span>
                {run.errorMessage && (
                  <p className="w-full text-negative">
                    {run.errorCode}: {run.errorMessage}
                  </p>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
