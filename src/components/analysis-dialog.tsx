"use client";
import { useId, useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { MAX_TWEET_LIMIT, type SocialConfiguration } from "@/types/social";

export function AnalysisDialog({
  symbol,
  force = false,
  tickerCount = 1,
  config,
  onClose,
  onAnalyze,
}: {
  symbol?: string;
  force?: boolean;
  tickerCount?: number;
  config: SocialConfiguration;
  onClose: () => void;
  onAnalyze: (tweetLimit: number, includeAuthorProfiles: boolean) => void;
}) {
  const id = useId();
  const [includeX, setIncludeX] = useState(config.xEnabled && config.defaultTweetLimit > 0);
  const [limit, setLimit] = useState(String(config.defaultTweetLimit || 10));
  const [includeProfiles, setIncludeProfiles] = useState(false);
  const includeAuthorProfiles = includeX && config.xProfileLookupLimit > 0 && includeProfiles;
  const tweetLimit = includeX ? Number(limit) : 0;
  const valid =
    !includeX ||
    (Number.isInteger(tweetLimit) && tweetLimit >= 10 && tweetLimit <= MAX_TWEET_LIMIT);
  const estimatedCost = config.demo
    ? 0
    : (tweetLimit * config.xPostReadCostUsd +
        (includeAuthorProfiles ? config.xProfileLookupLimit * config.xProfileReadCostUsd : 0)) *
      (symbol ? 1 : tickerCount);
  const action = force ? "Re-analyze" : symbol ? "Analyze" : "Analyze all";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogTitle>
          {action}
          {symbol ? ` ${symbol}` : " tickers"}
        </DialogTitle>
        <DialogDescription>
          {force
            ? "Create a new saved analysis, including when one already exists today."
            : symbol
              ? "Choose the research context for this analysis."
              : `Analyze ${tickerCount} enabled companies. The X limit applies to each company.`}
          {!config.demo && " Live mode may incur charges from the selected AI provider."}
        </DialogDescription>
        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) onAnalyze(tweetLimit, includeAuthorProfiles);
          }}
        >
          <label className="flex items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={includeX}
              disabled={!config.xEnabled}
              onChange={(event) => setIncludeX(event.target.checked)}
              className="size-4 accent-primary"
            />
            Include X posts
          </label>
          {config.xEnabled ? (
            <>
              <label htmlFor={id} className="mt-5 block text-xs font-medium">
                Maximum X posts per company
              </label>
              <input
                id={id}
                type="number"
                min={10}
                max={MAX_TWEET_LIMIT}
                step={1}
                required={includeX}
                disabled={!includeX}
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
                aria-describedby={`${id}-help`}
                className="input mt-2 font-mono disabled:opacity-50"
              />
              <p id={`${id}-help`} className="mt-2 text-[11px] leading-5 text-muted-foreground">
                Collect 10-100 posts. Up to 10 relevant posts are retained for analysis. Turn X off
                to skip collection.
              </p>
              <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
                Posts are reused for 24 hours. A larger limit takes effect at the next collection.
              </p>
              {config.xProfileLookupLimit > 0 && (
                <label className="mt-4 flex items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={includeProfiles}
                    disabled={!includeX}
                    onChange={(event) => setIncludeProfiles(event.target.checked)}
                    className="size-4 shrink-0 accent-primary"
                  />
                  Look up new author profiles
                </label>
              )}
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                Cached profiles are reused for {config.xProfileCacheDays} days across companies.
                {config.xProfileLookupLimit > 0 &&
                  ` Enable lookups for up to ${config.xProfileLookupLimit} new or expired profiles per company. Profile details do not establish reliability.`}
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              X is not connected. This analysis will use your other research sources.
            </p>
          )}
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-xs leading-6">
            <div className="flex items-center justify-between gap-3">
              <span>{config.demo ? "X cost in demo mode" : "Estimated maximum X cost"}</span>
              <span className="font-mono">{valid ? `$${estimatedCost.toFixed(2)}` : "-"}</span>
            </div>
            <p className="mt-1 text-[10px] leading-5 text-muted-foreground">
              {config.demo
                ? "Synthetic posts only. No external service is called."
                : "Based on returned posts and optional new profiles before filtering. Cache reuse reduces this estimate. Other provider costs are additional."}
            </p>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid}>
              {action}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
