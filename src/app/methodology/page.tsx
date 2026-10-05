import { getEnv } from "@/server/env";
import { ArrowDownRight, ArrowUpRight, Minus, ShieldCheck } from "lucide-react";
export const metadata = { title: "Methodology" };
export default function MethodologyPage() {
  return (
    <div className="max-w-4xl">
      <p className="eyebrow mb-2">Evidence before emotion</p>
      <h1 className="page-title">A consistent investment rubric.</h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        Thesis organizes market data, fundamentals, and recent company news into a structured
        decision context. It assesses whether the available evidence materially changes the
        investment thesis over a {getEnv().INVESTMENT_HORIZON} horizon.
      </p>
      <div className="my-7 grid gap-4 md:grid-cols-3">
        {[
          {
            label: "BUY",
            text: "Substantiated evidence supports a sufficiently attractive risk/reward opportunity to consider adding exposure.",
            Icon: ArrowUpRight,
            color: "text-positive",
          },
          {
            label: "HOLD",
            text: "The evidence is mixed, incomplete, or insufficient to justify changing the current position.",
            Icon: Minus,
            color: "text-neutral-signal",
          },
          {
            label: "SELL",
            text: "Substantiated deterioration, excessive risk, or materially unfavorable risk/reward supports considering reduced exposure.",
            Icon: ArrowDownRight,
            color: "text-negative",
          },
        ].map(({ label, text, Icon, color }) => (
          <section key={label} className="panel p-5">
            <h2 className={`flex items-center gap-2 font-mono text-sm ${color}`}>
              <Icon className="size-4" />
              {label}
            </h2>
            <p className="mt-4 text-xs leading-6 text-muted-foreground">{text}</p>
          </section>
        ))}
      </div>
      <section className="panel space-y-6 p-6">
        <div>
          <h2 className="text-sm font-medium">How Jev is used</h2>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            Jev returns typed choices with confidence and probability distributions. One bounded
            choice classifies BUY / HOLD / SELL. Independent choices assess materiality of facts and
            direction of news. Explanatory text is assembled in code from those source facts; Jev
            does not generate free-form prose. Arithmetic, date filtering, and data normalization
            happen in code.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-medium">What confidence means</h2>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            Confidence describes how concentrated Jev’s probability distribution is for the
            classification. An 82% confidence BUY means confidence in that classification given this
            context. It does not mean an 82% chance of a price increase, and it has not been
            calibrated against your stock-picking outcomes.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-medium">Data boundaries</h2>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            V1 uses the latest available quote, roughly 65 daily price bars, basic trailing company
            metrics, and at most eight recent, deduplicated company-news articles. Price momentum is
            not treated as proof of fundamental improvement. Data may be delayed, news summaries may
            omit context, and reported metrics do not verify forward analyst revisions or
            fiscal-period freshness. Missing optional data is made visible. A failed decision-engine
            call produces no recommendation.
          </p>
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-primary" />
            The final decision stays with you
          </h2>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            Review source articles, data freshness, your current exposure, and your own investment
            objectives. This application has no broker connection and cannot place orders. Every
            trading action requires your independent manual decision.
          </p>
        </div>
      </section>
      <p className="mt-5 text-xs text-muted-foreground">
        Reference:{" "}
        <a
          className="text-primary underline underline-offset-4"
          href="https://docs.typesafe.ai/confidence"
          target="_blank"
          rel="noopener noreferrer"
        >
          TypeSafe confidence documentation
        </a>
        .
      </p>
    </div>
  );
}
