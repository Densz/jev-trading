import { getUsage } from "@/server/queries";
import { getEnv } from "@/server/env";
import { Coins, Database, Gauge, ReceiptText } from "lucide-react";
export const metadata = { title: "API usage" };
const cost = (value: number) => `$${value.toFixed(6)}`;
export default async function UsagePage() {
  const usage = await getUsage();
  return (
    <>
      <p className="eyebrow mb-2">Keep your research efficient</p>
      <h1 className="page-title">API usage & cost</h1>
      <p className="mt-2 mb-7 text-xs text-muted-foreground">
        Request-level observability for this calendar month (UTC), including failures and cache
        reuse.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "Estimated today", value: cost(usage.todayCost), icon: Coins },
          { label: "Estimated this month", value: cost(usage.monthCost), icon: ReceiptText },
          { label: "External requests", value: usage.requests.toLocaleString(), icon: Gauge },
          { label: "Cache hits", value: usage.cacheHits.toLocaleString(), icon: Database },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="panel p-5">
            <div className="flex justify-between">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <Icon className="size-4 text-primary" />
            </div>
            <p className="mt-4 font-mono text-xl tracking-tight">{value}</p>
          </div>
        ))}
      </div>
      <div className="panel mb-6 p-5 text-xs leading-6 text-muted-foreground">
        <p>
          Average recorded variable cost per saved analysis:{" "}
          <span className="font-mono text-foreground">
            {usage.averageCost == null ? "No analyses this month" : cost(usage.averageCost)}
          </span>
          . This includes recorded spend on failed attempts.
        </p>
        <p className="mt-1">
          Jev estimate: ${getEnv().JEV_INPUT_USD_PER_MILLION} per million reported input tokens;
          output tokens are free. Market/news calls have zero estimated variable cost on the
          selected free plans. Subscriptions, hosting, and unreported timeout billing are excluded.
        </p>
        {usage.unknownCosts > 0 && (
          <p className="mt-2 text-neutral-signal">
            {usage.unknownCosts} request(s) have unknown cost because no usable billing usage was
            returned. Totals are incomplete estimates.
          </p>
        )}
        {getEnv().DEMO_MODE && (
          <p className="mt-2 text-neutral-signal">
            Synthetic analyses call no external services and incur no API cost.
          </p>
        )}
      </div>
      <section className="panel mb-6 overflow-hidden">
        <h2 className="border-b border-border px-5 py-4 text-sm font-medium">Cost by ticker</h2>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Requests</th>
                <th>Cache hits</th>
                <th>Failures</th>
                <th>Input tokens</th>
                <th>Estimated cost</th>
              </tr>
            </thead>
            <tbody>
              {usage.byTicker.map((r) => (
                <tr key={r.symbol}>
                  <td className="font-mono font-semibold">{r.symbol}</td>
                  <td>{r.requests}</td>
                  <td>{r.cached}</td>
                  <td>{r.failures}</td>
                  <td className="font-mono">{r.inputTokens.toLocaleString()}</td>
                  <td className="font-mono">{cost(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!usage.byTicker.length && (
            <p className="p-8 text-center text-xs text-muted-foreground">
              No external API activity recorded this month.
            </p>
          )}
        </div>
      </section>
      <section className="panel overflow-hidden">
        <h2 className="border-b border-border px-5 py-4 text-sm font-medium">
          Recent provider activity
        </h2>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>Ticker</th>
                <th>Provider / operation</th>
                <th>Result</th>
                <th>Duration</th>
                <th>Estimated cost</th>
              </tr>
            </thead>
            <tbody>
              {usage.recent.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString("en-US", { timeZone: "UTC" })}
                  </td>
                  <td className="font-mono">{r.symbol}</td>
                  <td>
                    {r.provider} / {r.operation}
                  </td>
                  <td className={r.success ? "text-primary" : "text-negative"}>
                    {r.cached ? "Cache hit" : r.success ? `OK · attempt ${r.attempt}` : r.errorCode}
                  </td>
                  <td className="font-mono">{r.durationMs}ms</td>
                  <td className="font-mono">
                    {r.estimatedCostUsd == null ? "Unknown" : cost(r.estimatedCostUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!usage.recent.length && (
            <p className="p-8 text-center text-xs text-muted-foreground">
              Provider activity will appear after live quote retrieval or analysis.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
