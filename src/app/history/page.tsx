import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { getRecentAnalyses } from "@/server/queries";
import { Confidence, DecisionBadge } from "@/components/decision-badge";
export const metadata = { title: "Analysis history" };
export default async function HistoryPage() {
  const analyses = await getRecentAnalyses();
  return (
    <>
      <p className="eyebrow mb-2">A record of your research</p>
      <h1 className="page-title">Analysis history</h1>
      <p className="mt-2 mb-7 text-xs text-muted-foreground">
        Every successful analysis is preserved. Open a record to inspect its original evidence and
        recommendation.
      </p>
      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-sm font-medium">Recent analyses</h2>
          <span className="text-[10px] text-muted-foreground">Latest 100 · UTC</span>
        </div>
        {analyses.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Analyzed</th>
                  <th>Decision</th>
                  <th>Confidence</th>
                  <th>Provider / model</th>
                  <th>Summary</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {analyses.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link
                        href={`/tickers/${a.symbol}?analysis=${a.id}`}
                        className="font-mono font-semibold hover:text-primary"
                      >
                        {a.symbol}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString("en-US", { timeZone: "UTC" })}
                    </td>
                    <td>
                      <DecisionBadge decision={a.decision} />
                    </td>
                    <td>
                      <Confidence value={a.confidence} />
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {a.engine} / {a.model}
                    </td>
                    <td>
                      <p className="line-clamp-2 max-w-md text-[11px] leading-5 text-muted-foreground">
                        {a.summary}
                      </p>
                    </td>
                    <td>
                      <Link
                        href={`/tickers/${a.symbol}?analysis=${a.id}`}
                        aria-label={`View ${a.symbol} analysis`}
                      >
                        <ArrowUpRight className="size-4 text-muted-foreground" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-20 text-center">
            <Clock3 className="mx-auto mb-4 size-7 text-muted-foreground" />
            <p className="text-sm font-medium">Your research record starts here.</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Analyze a ticker from the watchlist to save your first decision.
            </p>
            <Link href="/" className="mt-5 inline-block text-xs text-primary">
              Go to watchlist
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
