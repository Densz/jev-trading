"use client";
import Link from "next/link";
import { Loader2, ShieldAlert, Sparkles, X } from "lucide-react";
import type { TickerView } from "@/server/queries";
import { cn, money, percent, relativeTime } from "@/lib/utils";
import { Confidence, DecisionBadge } from "./decision-badge";
import { Button } from "./ui/button";

export function MobileTickers({
  tickers,
  busy,
  blocked,
  changing,
  onAnalyze,
  onDisable,
  onEnable,
}: {
  tickers: TickerView[];
  busy: string | null;
  blocked: boolean;
  changing: boolean;
  onAnalyze: (ticker: TickerView) => void;
  onDisable: (ticker: TickerView) => void;
  onEnable: (ticker: TickerView) => void;
}) {
  return (
    <div className="divide-y divide-border md:hidden">
      {tickers.map((t) => (
        <article key={t.symbol} className={cn("p-5", !t.enabled && "opacity-55")}>
          <div className="flex items-start justify-between gap-3">
            <Link href={`/tickers/${t.symbol}`} className="min-w-0">
              <h3 className="font-mono text-sm font-semibold">{t.symbol}</h3>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{t.name}</p>
            </Link>
            <div className="shrink-0 text-right">
              {t.quote ? (
                <>
                  <p className="font-mono text-xs">{money(t.quote.price, t.quote.currency)}</p>
                  <p
                    className={cn(
                      "mt-1 font-mono text-[10px]",
                      t.quote.changePercent >= 0 ? "text-positive" : "text-negative",
                    )}
                  >
                    {percent(t.quote.changePercent)}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No quote</p>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            {t.latest ? (
              <>
                <DecisionBadge decision={t.latest.decision} />
                <Confidence value={t.latest.confidence} />
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground">Awaiting first analysis</span>
            )}
          </div>
          {t.latest && (
            <>
              <p className="mt-3 line-clamp-3 text-xs leading-6 text-muted-foreground">
                {t.latest.summary}
              </p>
              {t.latest.risks[0] && (
                <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-5 text-neutral-signal">
                  <ShieldAlert className="mt-1 size-3 shrink-0" />
                  <span className="line-clamp-2">{t.latest.risks[0]}</span>
                </p>
              )}
            </>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] text-muted-foreground">
                {t.latest ? relativeTime(t.latest.createdAt) : "Not analyzed"}
              </p>
              {["FAILED", "INTERRUPTED"].includes(t.run?.status ?? "") && (
                <p className="text-[10px] text-negative">Last run failed</p>
              )}
              {t.run?.status === "RUNNING" && (
                <p className="text-[10px] text-primary">Running: {t.run.stage}</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              {t.enabled ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={blocked}
                    aria-label={`Analyze ${t.symbol}`}
                    onClick={() => onAnalyze(t)}
                  >
                    {busy === t.symbol ? <Loader2 className="animate-spin" /> : <Sparkles />}Analyze
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={blocked}
                    aria-label={`Disable ${t.symbol}`}
                    onClick={() => onDisable(t)}
                  >
                    <X />
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" disabled={changing} onClick={() => onEnable(t)}>
                  Enable
                </Button>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
