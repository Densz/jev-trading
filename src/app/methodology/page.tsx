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
          <h2 className="text-sm font-medium">X discussion and collection limits</h2>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            Optional X recent search requests up to {getEnv().X_DEFAULT_TWEET_LIMIT} posts per
            company by default. The limit can be changed or X disabled before each manual analysis.
            Search uses company names, stock cashtags, business topics, and X relevance ordering,
            excluding reposts and replies. Up to ten recent posts are included after deduplication
            and a maximum of two posts per identified author. This is a selected discussion sample,
            not a representative sentiment measure or verified reporting. Collections are reused for
            24 hours even when the requested limit changes. There is one request per collection,
            with no pagination or automatic retries. X outages do not block the other sources.
          </p>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            Author profiles are cached for {getEnv().X_PROFILE_CACHE_DAYS} days by account ID and
            shared across companies. New profile lookups are off by default; when enabled, up to{" "}
            {getEnv().X_PROFILE_LOOKUP_LIMIT} new or expired authors are requested per company in
            one batch without retries. Profile details and follower counts do not verify account
            identity or the accuracy of a post. Each analysis preserves the profiles it used.
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
            V2 adds up to eight quarterly periods, three annual periods, and two six-month
            cumulative periods from standard SEC company-level XBRL facts. Fiscal dates, currencies,
            filing sources, and calculation provenance are preserved. Ratios and comparable
            year-over-year changes are calculated in code. Quarterly flows may be derived from
            cumulative reports; diluted EPS is never derived by subtraction. Custom segment data and
            non-GAAP adjustments are not automatically normalized. Keyword-selected official
            excerpts provide source passages, not a comprehensive report review or an independently
            verified forecast. Up to twelve company-news events from the last thirty days are
            selected, with identity parameters preserved and syndicated coverage grouped. Headlines
            and publisher summaries are not full articles. Price momentum is not proof of
            fundamental improvement, and analyst consensus, earnings surprises, and forward
            revisions are not verified. Missing optional data remains visible. A failed
            decision-engine call produces no recommendation.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-medium">Coverage is not model confidence</h2>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            The baseline is covered only when at least four quarterly and two annual periods are
            available, the latest period is no more than 150 days old with revenue, diluted EPS and
            operating cash flow, at least three potentially material news events from two publishers
            (excluding market opinions and uncategorized stories), and an official outlook excerpt.
            Otherwise coverage is partial or limited and classifications are labeled provisional.
            This operational checklist is not a statistical quality score, a guarantee of
            completeness, or a return prediction. Annual-only and foreign reporting may therefore
            remain partial even when valid reports exist.
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
