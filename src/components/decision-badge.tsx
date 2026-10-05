import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { TradingDecision } from "@/types/analysis";
import { cn } from "@/lib/utils";
export function DecisionBadge({ decision, large }: { decision: TradingDecision; large?: boolean }) {
  const Icon = decision === "BUY" ? ArrowUpRight : decision === "SELL" ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border font-mono text-[10px] font-semibold tracking-wider",
        large ? "px-3 py-1.5 text-sm" : "px-2 py-1",
        decision === "BUY"
          ? "border-positive/20 bg-positive/10 text-positive"
          : decision === "SELL"
            ? "border-negative/20 bg-negative/10 text-negative"
            : "border-neutral-signal/20 bg-neutral-signal/10 text-neutral-signal",
      )}
    >
      <Icon className={large ? "size-4" : "size-3"} />
      {decision}
    </span>
  );
}
export function Confidence({ value }: { value: number }) {
  return (
    <div
      className="flex items-center gap-2.5"
      title={`${Math.round(value * 100)}% confidence in the classification given the available information. This is not the probability of a price increase.`}
    >
      <span className="w-9 font-mono text-xs tabular-nums">{Math.round(value * 100)}%</span>
      <span className="h-1 w-14 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-primary/65"
          style={{ width: `${value * 100}%` }}
        />
      </span>
    </div>
  );
}
