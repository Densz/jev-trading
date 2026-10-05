"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Clock3,
  ListPlus,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import type { TickerView } from "@/server/queries";
import { money, percent, relativeTime, cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Confidence, DecisionBadge } from "./decision-badge";
import { StatusMessage, useAnalysis } from "./analysis-actions";
import { MobileTickers } from "./mobile-tickers";

const colors: Record<string, string> = {
  AAPL: "bg-slate-500/15 text-slate-400",
  NVDA: "bg-lime-500/15 text-lime-500",
  MSFT: "bg-blue-500/15 text-blue-400",
  GOOGL: "bg-yellow-500/15 text-yellow-500",
  AMZN: "bg-orange-500/15 text-orange-500",
  TSLA: "bg-red-500/15 text-red-400",
};
export function CompanyMark({ symbol }: { symbol: string }) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg border border-current/10 font-semibold",
        colors[symbol] ?? "bg-primary/10 text-primary",
      )}
    >
      {symbol === "NVDA" ? "n" : symbol.slice(0, 1)}
    </span>
  );
}

export function Watchlist({
  tickers,
  config,
}: {
  tickers: TickerView[];
  config: { demo: boolean; horizon: string; missing: string[] };
}) {
  const router = useRouter();
  const { busy, progress, message, analyze, setMessage } = useAnalysis();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [showDisabled, setShowDisabled] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [disable, setDisable] = useState<TickerView | null>(null);
  const [changing, setChanging] = useState(false);
  const [reAnalyze, setReAnalyze] = useState<string | null>(null);
  const enabled = tickers.filter((t) => t.enabled);
  const disabled = tickers.filter((t) => !t.enabled);
  const analyzed = enabled.filter((t) => t.latest);
  const counts = {
    BUY: analyzed.filter((t) => t.latest?.decision === "BUY").length,
    HOLD: analyzed.filter((t) => t.latest?.decision === "HOLD").length,
    SELL: analyzed.filter((t) => t.latest?.decision === "SELL").length,
  };
  const visible = (showDisabled ? tickers : enabled).filter(
    (t) =>
      `${t.symbol} ${t.name}`.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" || t.latest?.decision === filter),
  );
  const recent = [...analyzed].sort((a, b) =>
    (b.latest?.createdAt ?? "").localeCompare(a.latest?.createdAt ?? ""),
  )[0];
  const news = analyzed
    .flatMap((t) => (t.latest?.input.news ?? []).map((n) => ({ ...n, symbol: t.symbol })))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .filter((n, i, all) => all.findIndex((other) => other.url === n.url) === i)
    .slice(0, 3);
  const running = tickers.some((t) => t.run?.status === "RUNNING");
  useEffect(() => {
    if (!running && !busy) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [running, busy, router]);
  function openAdd(value = "") {
    setSymbol(value);
    setAddError("");
    setAddOpen(true);
  }
  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (adding) return;
    setAdding(true);
    setAddError("");
    try {
      const response = await fetch("/api/tickers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAddOpen(false);
      setSymbol("");
      setMessage({
        text: `${symbol.toUpperCase()} added to the watchlist. Run an analysis to get a recommendation.`,
        error: false,
      });
      router.refresh();
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "Ticker could not be added.");
    } finally {
      setAdding(false);
    }
  }
  async function toggle(ticker: TickerView) {
    if (changing) return;
    setChanging(true);
    try {
      const response = await fetch(`/api/tickers/${ticker.symbol}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !ticker.enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDisable(null);
      router.refresh();
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Could not update the ticker.",
        error: true,
      });
    } finally {
      setChanging(false);
    }
  }
  return (
    <>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Less noise. More conviction.</p>
          <h1 className="page-title">Your research, at a glance.</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            A consistent view of your watchlist. Every recommendation backed by evidence.
          </p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" onClick={() => openAdd()} disabled={adding || !!busy}>
            <Plus />
            Add ticker
          </Button>
          <Button
            onClick={() => void analyze()}
            disabled={!enabled.length || !!busy || running || config.missing.length > 0}
          >
            {busy === "all" ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy === "all" ? `Analyzing ${progress}/${enabled.length}` : "Analyze all"}
          </Button>
        </div>
      </div>
      {config.missing.length > 0 && (
        <div className="panel mb-6 flex items-start gap-3 border-amber-500/25 p-4">
          <ShieldAlert className="mt-0.5 size-5 text-amber-500" />
          <div>
            <p className="text-sm font-medium">Connect your research providers</p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              Set {config.missing.join(", ")} in the server environment, then restart the app. Live
              recommendations require real provider data and a successful Jev response.
            </p>
          </div>
        </div>
      )}
      <div className="mb-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            label: "Monitored tickers",
            value: enabled.length,
            detail: `${analyzed.length} analyzed · ${enabled.length - analyzed.length} awaiting analysis`,
            icon: Activity,
            color: "text-foreground",
          },
          {
            label: "Buy signals",
            value: counts.BUY,
            detail: "Attractive risk / reward",
            icon: ArrowUpRight,
            color: "text-positive",
          },
          {
            label: "Hold signals",
            value: counts.HOLD,
            detail: "No thesis change justified",
            icon: Clock3,
            color: "text-neutral-signal",
          },
          {
            label: "Sell signals",
            value: counts.SELL,
            detail: "Deterioration or excess risk",
            icon: ArrowDownRight,
            color: "text-negative",
          },
        ].map(({ label, value, detail, icon: Icon, color }) => (
          <div key={label} className="panel p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <Icon className={cn("size-4", color)} />
            </div>
            <p
              className={cn(
                "mt-3 font-mono text-[29px] font-medium leading-none tracking-tight",
                color,
              )}
            >
              {String(value).padStart(2, "0")}
            </p>
            <p className="mt-3 text-[10px] text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_290px]">
        <section className="panel min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium">Watchlist</h2>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {enabled.length}
              </span>
            </div>
            <label className="relative">
              <span className="sr-only">Search watchlist</span>
              <Search className="absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 w-44 rounded-md border border-border bg-background pr-3 pl-8 text-xs outline-none focus-visible:ring-1 focus-visible:ring-primary"
                placeholder="Search tickers..."
              />
            </label>
          </div>
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex gap-1" aria-label="Filter by recommendation">
              {["all", "BUY", "HOLD", "SELL"].map((value) => (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-[11px]",
                    filter === value
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {value === "all" ? "All tickers" : value.charAt(0) + value.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <span className="hidden text-[10px] text-muted-foreground sm:block">
              {config.horizon} horizon
            </span>
          </div>
          {!enabled.length && !showDisabled ? (
            <div className="flex min-h-[325px] flex-col items-center justify-center px-5 py-12 text-center">
              <span className="mb-5 rounded-xl border border-border bg-muted/40 p-4">
                <ListPlus className="size-7 text-primary" />
              </span>
              <h3 className="text-base font-medium">Start with the companies you follow.</h3>
              <p className="mt-2 max-w-sm text-xs leading-6 text-muted-foreground">
                Add a ticker to bring its market data, recent news, and investment thesis into one
                focused view.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {["AAPL", "NVDA", "MSFT", "GOOGL", "AMZN", "TSLA"].map((s) => (
                  <Button key={s} variant="outline" size="sm" onClick={() => openAdd(s)}>
                    <Plus className="!size-3" />
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <MobileTickers
                tickers={visible}
                busy={busy}
                blocked={!!busy || running || config.missing.length > 0}
                changing={changing}
                onAnalyze={(t) => (t.latest ? setReAnalyze(t.symbol) : void analyze(t.symbol))}
                onDisable={setDisable}
                onEnable={(t) => void toggle(t)}
              />
              <div className="hidden overflow-x-auto md:block">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Snapshot / day</th>
                      <th>Decision</th>
                      <th>Confidence</th>
                      <th>Last analysis</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((t) => (
                      <tr key={t.symbol} className={!t.enabled ? "opacity-55" : undefined}>
                        <td>
                          <Link href={`/tickers/${t.symbol}`} className="flex items-center gap-3">
                            <CompanyMark symbol={t.symbol} />
                            <div>
                              <span className="font-mono text-xs font-semibold">{t.symbol}</span>
                              <p className="mt-1 max-w-32 truncate text-[10px] text-muted-foreground">
                                {t.name}
                              </p>
                            </div>
                          </Link>
                        </td>
                        <td className="whitespace-nowrap">
                          {t.quote ? (
                            <div
                              title={`Quote as of ${new Date(t.quote.asOf).toLocaleString()}; provider: ${t.quote.provider}`}
                            >
                              <p className="font-mono text-xs tabular-nums">
                                {money(t.quote.price, t.quote.currency)}
                              </p>
                              <p
                                className={cn(
                                  "mt-1 font-mono text-[10px]",
                                  t.quote.changePercent >= 0 ? "text-positive" : "text-negative",
                                )}
                              >
                                {percent(t.quote.changePercent)}
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Unavailable</span>
                          )}
                        </td>
                        <td>
                          {t.latest ? (
                            <DecisionBadge decision={t.latest.decision} />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Not analyzed</span>
                          )}
                        </td>
                        <td>
                          {t.latest ? (
                            <Confidence value={t.latest.confidence} />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap">
                          <p
                            className="text-[10px] text-muted-foreground"
                            title={t.latest?.createdAt}
                          >
                            {t.latest ? relativeTime(t.latest.createdAt) : "Awaiting first run"}
                          </p>
                          {t.run?.status === "FAILED" || t.run?.status === "INTERRUPTED" ? (
                            <p
                              className="mt-1 max-w-32 truncate text-[10px] text-negative"
                              title={t.run.errorMessage ?? "Analysis failed"}
                            >
                              Last run failed
                            </p>
                          ) : null}
                          {t.run?.status === "RUNNING" && (
                            <p className="mt-1 flex items-center gap-1 text-[10px] text-primary">
                              <Loader2 className="size-3 animate-spin" />
                              {t.run.stage}
                            </p>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            {t.enabled ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label={`Analyze ${t.symbol}`}
                                  disabled={!!busy || running || config.missing.length > 0}
                                  onClick={() =>
                                    t.latest ? setReAnalyze(t.symbol) : void analyze(t.symbol)
                                  }
                                >
                                  {busy === t.symbol ? (
                                    <Loader2 className="animate-spin" />
                                  ) : (
                                    <Sparkles className="!size-3.5" />
                                  )}
                                  Analyze
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={`Disable ${t.symbol}`}
                                  disabled={!!busy || running}
                                  onClick={() => setDisable(t)}
                                >
                                  <X className="!size-3.5" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={changing}
                                onClick={() => void toggle(t)}
                              >
                                Enable
                              </Button>
                            )}
                            <Link
                              href={`/tickers/${t.symbol}`}
                              aria-label={`Open ${t.symbol} details`}
                              className="rounded p-1 text-muted-foreground hover:text-foreground"
                            >
                              <ChevronRight className="size-4" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {visible.length === 0 && (
                <p className="py-12 text-center text-xs text-muted-foreground">
                  No tickers match your search or filter.
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ShieldAlert className="size-3" />
              Confidence describes classification certainty, not expected return.
            </span>
            {disabled.length > 0 && (
              <button className="text-primary" onClick={() => setShowDisabled(!showDisabled)}>
                {showDisabled ? "Hide disabled" : `Show disabled (${disabled.length})`}
              </button>
            )}
          </div>
        </section>
        <aside className="space-y-5">
          <section className="panel overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-5 py-4">
              <Sparkles className="size-4 text-primary" />
              <h2 className="text-sm font-medium">Research brief</h2>
            </div>
            <div className="p-5">
              {recent?.latest ? (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <Link
                      href={`/tickers/${recent.symbol}`}
                      className="font-mono text-sm font-semibold"
                    >
                      {recent.symbol}
                    </Link>
                    <DecisionBadge decision={recent.latest.decision} />
                  </div>
                  <p className="text-xs leading-6 text-muted-foreground">{recent.latest.summary}</p>
                  <div className="mt-4 rounded-md border border-border bg-background p-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium">
                      <ShieldAlert className="size-3 text-neutral-signal" />
                      Key consideration
                    </p>
                    <p className="text-[11px] leading-5 text-muted-foreground">
                      {recent.latest.risks[0] ??
                        "Review the original evidence and your own risk tolerance."}
                    </p>
                  </div>
                  <Link
                    href={`/tickers/${recent.symbol}`}
                    className="mt-4 flex items-center justify-between text-[11px] text-primary"
                  >
                    Read full analysis
                    <ArrowRight className="size-3" />
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">Evidence before emotion.</p>
                  <p className="mt-3 text-xs leading-6 text-muted-foreground">
                    Run your first analysis to see the recommendation, its supporting evidence, and
                    the risks that deserve your attention.
                  </p>
                  <div className="mt-5 space-y-3">
                    {[
                      "Market data & recent news",
                      "A consistent investment rubric",
                      "A decision you can inspect",
                    ].map((text, index) => (
                      <div
                        key={text}
                        className="flex items-center gap-3 text-[11px] text-muted-foreground"
                      >
                        <span className="flex size-5 items-center justify-center rounded border border-border font-mono text-[9px] text-primary">
                          {index + 1}
                        </span>
                        {text}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>
          <section className="panel p-5">
            <p className="eyebrow">Decision framework</p>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              We assess changes to the investment thesis over your {config.horizon} horizon. Daily
              price movement is one input in a broader research context.
            </p>
            <Link
              href="/methodology"
              className="mt-4 flex items-center gap-1 text-[11px] text-primary"
            >
              How it works
              <ArrowUpRight className="size-3" />
            </Link>
          </section>
        </aside>
      </div>
      <StatusMessage message={message} />
      <section className="mt-7">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium">From the research feed</h2>
          <span className="eyebrow">Included in saved analyses</span>
        </div>
        {news.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            {news.map((n) => (
              <a
                key={n.url}
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="panel group p-5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-primary">{n.symbol}</span>
                  <ArrowUpRight className="size-3.5 text-muted-foreground group-hover:text-primary" />
                </div>
                <h3 className="mt-3 text-xs font-medium leading-6">{n.title}</h3>
                <p className="mt-4 text-[10px] text-muted-foreground">
                  {n.source} · {relativeTime(n.publishedAt)}
                </p>
              </a>
            ))}
          </div>
        ) : (
          <div className="panel px-5 py-6 text-xs text-muted-foreground">
            Relevant headlines will appear here after an analysis. Up to eight recent, deduplicated
            articles are considered per ticker.
          </div>
        )}
      </section>
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!adding) setAddOpen(open);
        }}
      >
        <DialogContent>
          <DialogTitle>Add a ticker</DialogTitle>
          <DialogDescription>
            Track a US-listed company. We’ll validate its symbol and retrieve its latest available
            quote.
          </DialogDescription>
          <form onSubmit={add} className="mt-5">
            <label htmlFor="ticker-symbol" className="text-xs font-medium">
              Stock symbol
            </label>
            <input
              id="ticker-symbol"
              autoComplete="off"
              className="input mt-2 font-mono uppercase"
              placeholder="e.g. AAPL"
              maxLength={10}
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              required
              disabled={adding}
              aria-describedby={addError ? "ticker-error" : undefined}
            />
            <p className="mt-2 text-[10px] text-muted-foreground">
              {config.demo
                ? "Demo symbols: AAPL, NVDA, MSFT, GOOGL, AMZN, TSLA."
                : "Examples: AAPL, MSFT, BRK.B. Provider symbol formats may vary."}
            </p>
            {addError && (
              <p id="ticker-error" role="alert" className="mt-3 text-xs leading-5 text-negative">
                {addError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
                disabled={adding}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={adding || !symbol.trim()}>
                {adding ? <Loader2 className="animate-spin" /> : <Plus />}
                {adding ? "Validating..." : "Add ticker"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!disable}
        onOpenChange={(open) => {
          if (!open && !changing) setDisable(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Disable {disable?.symbol}?</DialogTitle>
          <DialogDescription>
            This removes the ticker from the active watchlist and daily analysis. Its saved history
            remains available, and you can enable it again.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" disabled={changing} onClick={() => setDisable(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={changing}
              onClick={() => disable && void toggle(disable)}
            >
              {changing && <Loader2 className="animate-spin" />}Disable ticker
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!reAnalyze}
        onOpenChange={(open) => {
          if (!open) setReAnalyze(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Re-analyze {reAnalyze}?</DialogTitle>
          <DialogDescription>
            This saves a new analysis even if one exists today. Cached data may be reused, and live
            mode can incur another Jev API charge.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReAnalyze(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const value = reAnalyze;
                setReAnalyze(null);
                if (value) void analyze(value, true);
              }}
            >
              Re-analyze
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
