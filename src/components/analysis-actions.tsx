"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { Button } from "./ui/button";
import { AnalysisDialog } from "./analysis-dialog";
import type { RunResult } from "@/types/analysis";
import type { SocialConfiguration } from "@/types/social";
import type { AiProvider } from "@/lib/ai/config";
import { ProviderSelect } from "./provider-select";

export function useAnalysis() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [progress, setProgress] = useState(0);
  const [provider, setProvider] = useState<AiProvider | "default">("default");
  async function analyze(
    symbol?: string,
    force = false,
    tweetLimit?: number,
    includeAuthorProfiles = false,
  ) {
    if (busy) return;
    setBusy(symbol ?? "all");
    setProgress(0);
    setMessage(null);
    try {
      const response = await fetch(
        symbol ? `/api/tickers/${encodeURIComponent(symbol)}/analyze` : "/api/analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            force,
            tweetLimit,
            ...(includeAuthorProfiles ? { includeAuthorProfiles: true } : {}),
            ...(provider === "default" ? {} : { provider }),
          }),
        },
      );
      if (symbol) {
        const result = (await response.json()) as RunResult & { error?: string };
        if (!response.ok && !result.status)
          throw new Error(result.error ?? "Analysis request failed.");
        setMessage({
          text:
            result.status === "succeeded"
              ? `${symbol} analysis saved.`
              : (result.message ?? "Analysis could not complete."),
          error: result.status === "failed",
        });
      } else {
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error ?? "The batch request failed.");
        }
        const reader = response.body?.getReader();
        if (!reader) throw new Error("The batch connection was unavailable.");
        const decoder = new TextDecoder();
        let buffer = "";
        const results: RunResult[] = [];
        let completed = false;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as RunResult & { type: string };
            if (event.type === "result") {
              results.push(event);
              setProgress(results.length);
              router.refresh();
            }
            if (event.type === "error") throw new Error(event.message);
            if (event.type === "complete") completed = true;
          }
        }
        if (!completed)
          throw new Error(
            "The batch connection ended early. Completed analyses are saved; check the watchlist before retrying.",
          );
        const success = results.filter((r) => r.status === "succeeded").length;
        const failures = results.filter((r) => r.status === "failed");
        const skipped = results.filter((r) => ["skipped", "running"].includes(r.status)).length;
        setMessage({
          text: `${success} analyses saved${skipped ? `, ${skipped} skipped` : ""}${failures.length ? `, ${failures.length} failed: ${failures.map((f) => `${f.symbol}: ${f.message}`).join(" ")}` : "."}`,
          error: failures.length > 0,
        });
      }
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "The analysis request failed.",
        error: true,
      });
    } finally {
      setBusy(null);
      router.refresh();
    }
  }
  return { busy, progress, message, analyze, setMessage, provider, setProvider };
}
export function StatusMessage({ message }: { message: { text: string; error: boolean } | null }) {
  if (!message) return null;
  const Icon = message.error ? XCircle : CheckCircle2;
  return (
    <div
      role={message.error ? "alert" : "status"}
      className={`mt-4 flex items-start gap-2 rounded-lg border p-3 text-xs leading-5 ${message.error ? "border-negative/25 bg-negative/5 text-negative" : "border-primary/20 bg-primary/5 text-primary"}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      {message.text}
    </div>
  );
}
export function TickerAnalyze({
  symbol,
  hasAnalysis,
  enabled,
  running,
  config,
}: {
  symbol: string;
  hasAnalysis: boolean;
  enabled: boolean;
  running: boolean;
  config: SocialConfiguration;
}) {
  const { busy, message, analyze, provider, setProvider } = useAnalysis();
  const [confirm, setConfirm] = useState(false);
  return (
    <div>
      <div className="mb-3">
        <ProviderSelect value={provider} onChange={setProvider} disabled={!!busy || running} />
      </div>
      <Button disabled={!enabled || !!busy || running} onClick={() => setConfirm(true)}>
        {busy || running ? (
          <Loader2 className="animate-spin" />
        ) : hasAnalysis ? (
          <RefreshCw />
        ) : (
          <Sparkles />
        )}
        {busy || running ? "Analyzing..." : hasAnalysis ? "Re-analyze" : "Analyze"}
      </Button>
      <StatusMessage message={message} />
      {confirm && (
        <AnalysisDialog
          symbol={symbol}
          force={hasAnalysis}
          config={config}
          onClose={() => setConfirm(false)}
          onAnalyze={(tweetLimit, includeAuthorProfiles) => {
            setConfirm(false);
            void analyze(symbol, hasAnalysis, tweetLimit, includeAuthorProfiles);
          }}
        />
      )}
    </div>
  );
}
