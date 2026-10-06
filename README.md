# Thesis - personal AI-assisted equity research

A single-user decision-support dashboard built with Next.js App Router, React, TypeScript, Tailwind CSS, shadcn-style Radix components, PostgreSQL, Prisma, and Zod.
Jev classifies BUY / HOLD / SELL through the official `@typesafe-ai/sdk` package.
OpenAI, DeepSeek, or Claude can also interpret the supplied evidence and generate explanations.
The application has no broker connection and never executes trades.

## Start locally

Use Node.js 22.13+ (Node.js 24 LTS recommended), pnpm 10+, and Docker Compose.

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm prisma migrate dev
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).
PostgreSQL binds only to localhost on port **5434** to avoid conflicting with other local database installations.
The development server also binds only to localhost.
Prisma migrations are checked in; client generation runs on install, development server startup, and build.
After switching branches or changing the Prisma schema, apply the checked-in migrations with `pnpm prisma migrate deploy`, then restart the development server with `pnpm dev`.
Restarting also clears any Prisma instance cached by the previous server process.
The database volume preserves tickers, runs, usage, and analysis history across container restarts.

For live research, populate `.env` with Twelve Data and Finnhub API keys, then configure an AI provider below. Jev can also use `TYPESAFE_API_KEY` from `.env`.
Set `SEC_USER_AGENT="Thesis your-real-contact@your-domain.com"` to enable official financial reports.
The SEC requires a declared application and contact email; no SEC API key or subscription is required.
Without this setting, financial enrichment is explicitly unavailable and coverage is labeled limited, not silently substituted with trailing ratios.
Provider access and plan entitlements must be verified for your account.
There are no shared API keys in this repository.

### Local database snapshots

Local snapshots let you test migrations and restore the previous database state.
The commands use the PostgreSQL tools inside this project's Docker Compose container, so no host PostgreSQL client is required.
`DATABASE_URL` selects the database and must point to the loopback port published by that container.

```bash
# Save the database before applying a migration.
pnpm db:backup before-migration
pnpm prisma migrate deploy

# List snapshots, or restore the latest explicitly created snapshot.
pnpm db:backups
pnpm db:restore

# Restore a specific snapshot (use the path printed by db:backup).
pnpm db:restore .db-backups/jev_20261006T100000000Z_before-migration_01234567.dump
```

Snapshots include the complete schema, data, sequences and `_prisma_migrations` table.
Restoring a snapshot therefore also restores Prisma's record of which migrations have been applied.
It does not change your Git checkout or migration files.
To retry the migration after a restore, run `pnpm prisma migrate deploy` again.
If you switch to older application code, run `pnpm prisma generate` to align its client with that code's schema.

Stop the application and scheduler before restoring, then restart them afterwards.
The restore verifies the SHA-256 checksum, restores into a temporary database, and creates a safety snapshot before replacing the current database.
The two database renames happen in one transaction; a preparation or swap failure preserves the original database.
The command prints the safety snapshot's path so you can undo the restore as well.
Safety snapshots do not replace the latest explicit snapshot.
The command asks you to type the database name; use `--yes` for intentional non-interactive restores.
Concurrent snapshot commands for the same database are refused.

Archives and their `.info.json` files are stored together in the gitignored `.db-backups/` directory, with owner-only permissions, a checksum, timestamp and Git revision.
Keep both files together when moving a snapshot.
Set `JEV_DB_BACKUP_DIR` to use a different local directory.
The latest snapshot is tracked separately for each database.
Archives are not encrypted and contain all stored data.
Server environment variables are not included in snapshots.

### Synthetic workspace

Set `DEMO_MODE=true` in `.env`, restart the server, and add any of AAPL, NVDA, MSFT, GOOGL, AMZN, or TSLA.
Alternatively, run `pnpm demo:seed` to populate those six demonstration tickers and analyze them.
Prices, news, fundamentals, decisions, and confidence are synthetic fixtures; persistent banners identify this on every page.
No external service is called in demo mode.
Synthetic analyses are stored with `dataMode=demo`, and live queries use `dataMode=live`, so synthetic recommendations cannot appear in the live analysis history.
The ticker watchlist is shared between modes.
Demo mode is an explicit configuration, never a fallback after a live provider failure.

## Configuration

Secrets stay server-side; no secret uses a `NEXT_PUBLIC_*` variable. AI keys and model choices can be managed in the application.

| Variable | Required | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection URL; example points to Compose on port 5434. |
| `TWELVE_DATA_API_KEY` | Live | Twelve Data quote and daily time-series access. |
| `FINNHUB_API_KEY` | Live | Finnhub company news and basic trailing financial metrics. |
| `X_BEARER_TOKEN` | Optional | Enables supplementary X recent-search posts; absent token makes no X calls. |
| `X_DEFAULT_TWEET_LIMIT` | No | Defaults to `10` posts per company per collection; `0` disables X, otherwise `10-100`. Manual analyses can override it. |
| `X_POST_READ_COST_USD` | No | Estimated price per returned X post, default `0.005`; verify current rates in the X Developer Console. |
| `X_PROFILE_LOOKUP_LIMIT` | No | Maximum new/expired author profiles per company when explicitly selected, default `3`; `0` disables paid lookups, otherwise `1-10`. |
| `X_PROFILE_CACHE_DAYS` | No | Persistent profile cache lifetime, default `30` days; configurable from `1-365`. |
| `X_PROFILE_READ_COST_USD` | No | Estimated price per returned X user profile, default `0.01`; fresh cached profiles require no new X read. |
| `SEC_USER_AGENT` | Financial enrichment | Application name and real contact email for SEC fair access; never sent to Jev or exposed to clients. |
| `TYPESAFE_API_KEY` | Jev fallback | Official TypeSafe API key; a saved Jev key takes precedence. |
| `API_KEY_ENCRYPTION_KEY` | Saved API keys | Independent, random 32-byte key encoded as base64. Keep outside the database. |
| `TYPESAFE_MODEL` | No | Defaults to pinned `jev-1.13.0`; the returned model version is stored. |
| `INVESTMENT_HORIZON` | No | `medium-term` (3-12 months), `long-term` (1-3 years), or `short-term` (days-weeks). |
| `TWELVE_DATA_CREDITS_PER_MINUTE` | No | Defaults to 8; only raise to match your provider plan. |
| `DEMO_MODE` | No | Defaults to `false`; set `true` for synthetic data. |
| `JEV_INPUT_USD_PER_MILLION` | No | Estimated input-token price; defaults to `0.042`. |
| `APP_PASSWORD` | Production / saved keys | At least 16 characters; HTTP Basic username is `personal`. |
| `APP_ORIGIN` | Reverse proxy | Optional canonical origin, such as `https://research.example.com`, for write-origin checks. |
| `CRON_SECRET` | HTTP cron | At least 32 random characters; authenticated cron endpoint is disabled without it. |
| `DAILY_CRON` | No | Scheduler expression in UTC; defaults to `15 22 * * 1-5`. |
| `POSTGRES_PASSWORD` | Custom Compose password | Set together with the password in `DATABASE_URL` when changing the local default. |
| `TEST_DATABASE_URL` | No | Dedicated PostgreSQL test database name ending in `_test`; defaults to the configured database name plus `_test`. |

Changing an investment horizon changes future analyses, not existing records.
The exact horizon is stored in each normalized input.
V1 targets US-listed equities; international coverage requires a deliberate provider/normalization extension.

### AI providers and encrypted keys

1. Apply the checked-in migration with `pnpm prisma migrate deploy`.
2. Set a random `APP_PASSWORD` of at least 16 characters and generate a separate encryption key:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   Store the generated value as `API_KEY_ENCRYPTION_KEY` in the server environment or secret manager, then restart the application. Use HTTPS for remote access.
3. Open **AI settings** (`/settings`), enter the provider's API key and model ID, and save. Only the last four characters are displayed afterwards. **Test** sends a small billed request using the saved key/model; it is disabled in demo mode.
4. Choose the default provider for scheduled runs, or select a provider before a manual ticker or batch analysis. Suggested model IDs are editable because account entitlements and provider catalogs change. An invalid or unavailable model fails visibly without saving a recommendation.

Supported providers are Jev, OpenAI (Chat Completions with structured JSON), DeepSeek (JSON mode), and Claude (Anthropic Messages with validated JSON). Keys are encrypted using AES-256-GCM with random nonces and provider-bound authenticated data. The encryption key is never stored in PostgreSQL. API responses contain only key status and a masked suffix; credentials are excluded from normalized analysis inputs, saved engine results, and application logs. Network calls use fixed provider endpoints and reject redirects.

This is one password-protected personal workspace. Keys belong to the workspace, not separate user accounts. Production hosting must keep the server environment and database administration restricted. Save and test operations also require `APP_PASSWORD` in development. Market/news credentials remain server environment variables.

Keep the encryption key securely backed up separately from database backups. Changing or losing it prevents decryption of existing saved keys. To rotate, retain the old value until you are ready to replace every saved API key under the new value; this release does not automatically re-encrypt keys. Delete removes the stored credential and resets its default selection to Jev; a Jev environment key remains available. Revoke credentials at the provider to invalidate previously issued keys and backup copies.

The selected provider produces BUY/HOLD/SELL, an explanation, bullish/bearish factors and risks from the same bounded evidence context. Returned model versions and the requested model ID are retained in history. Daily deduplication is scoped to provider and requested model; re-analysis deliberately saves an additional record. To compare providers, run each explicitly and open their saved records. AI certainty scores are subjective and uncalibrated, unlike Jev's concentration formula, and should not be compared numerically.

OpenAI, DeepSeek, and Claude analyses send at most 64,000 context characters and request at most 4,096 completion tokens with a 60-second timeout. Those paid requests are not automatically retried; Jev retains its existing bounded retry policy. Token usage is recorded when returned, including on invalid decisions; model prices are left unknown rather than guessed. Set spending limits in your provider accounts. A ChatGPT subscription does not include API billing. Demo analyses and demo connection tests never call external APIs.

## Architecture

```text
MarketDataProvider + NewsProvider + FinancialReportsProvider
              |
       normalized AnalysisInput
              |
       replaceable DecisionEngine
              |
     strict output validation
              |
        PostgreSQL / Prisma
              |
      server-rendered dashboard
```

| Area | Responsibility |
| --- | --- |
| `src/types/analysis.ts` | Provider-independent contracts and strict Zod domain schemas. |
| `src/lib/market/` | Quote, daily history, and trailing fundamentals normalization. |
| `src/lib/news/` | Company-news normalization. |
| `src/lib/financials/` | SEC issuer lookup, financial periods, calculation provenance, and official filing excerpts. |
| `src/lib/analysis/` | Date filtering, deduplication, basic indicators, bounded context, and pipeline orchestration. |
| `src/lib/jev/` | Official SDK calls, Jev question design, response validation, and source-grounded explanation assembly. |
| `src/server/external.ts` | Persistent cache, provider throttling, timeouts, retries, and request-level usage. |
| `src/server/analysis-repository.ts` | Database locks, leases, daily deduplication, successful persistence, and failure records. |
| `src/app/api/` | Validated Route Handlers for ticker management, manual analysis, batch streaming, and cron. |
| `src/lib/demo/` | Explicit synthetic providers and engine. |

To compare another engine, implement `DecisionEngine.analyze(AnalysisInput): Promise<EngineResult>` and supply it through `createProviders`.
No Jev-specific question or answer type appears in the domain pipeline or UI.
The original normalized `AnalysisInput` is saved on every successful analysis and can be replayed unchanged for engine comparisons.
New analyses use `version=2` and `rubricVersion=thesis-v2`.
New V2 inputs also retain an optional `social` snapshot with the requested X limit, collection time, returned count, included posts, and any author profiles used.
Legacy V1 records remain readable and immutable; use Re-analyze to collect the richer context, including when a successful V1 record already exists for the same UTC day.
Provider-specific SDK calls stay inside adapters.

## Optional X research

Set `X_BEARER_TOKEN` server-side to enable X recent search.
Before an individual or batch analysis, choose the maximum posts per company or uncheck **Include X posts** to skip X entirely.
The default is 10, including scheduled analyses; change `X_DEFAULT_TWEET_LIMIT` to update that default.
X accepts a requested limit of 10-100, so 1-9 is rejected rather than silently rounded up.
Manual overrides apply to that run only and are saved in its normalized input.

Each fresh collection makes one search request with `max_results` set to the chosen limit and `sort_order=relevancy`, without pagination, automatic retries, or additional user/media expansions.
Queries combine the stock cashtag and company name with business topics, excluding reposts and replies.
Collections, including valid empty responses, are cached for 24 hours per ticker.
Changing the limit or forcing a new analysis reuses that collection; a larger limit takes effect after cache expiry and never triggers a top-up request.
After deduplication and a maximum of two posts per identified author, up to ten recent posts enter the model context.
Selection is a bounded discussion sample, not a guarantee of finding every relevant post or a representative sentiment measure.

Author profiles are stored in the existing PostgreSQL `ProviderCache`, keyed by stable account ID and shared across tickers and server instances.
Fresh profiles are reused for 30 days by default, independently of the 24-hour post cache.
New lookups are off by default, including scheduled analyses; select **Look up new author profiles** before an individual or batch analysis to enable them for that run.
Only missing or expired profiles for retained posts are requested, with a maximum of three new profiles per company by default and one batched `/2/users` request without retries.
Concurrent analyses claim short database leases so the same author is not fetched twice at once.
Explicitly missing accounts are cached for 24 hours, and incomplete or failed lookups cool down for five minutes without dropping the posts.
Each saved analysis keeps the exact profile snapshot it used, even after the shared cache refreshes.
Names, biographies, account dates, website links, and follower counts are metadata, not independently verified identities or reliability assessments.
Ticker relevance and the accuracy of individual claims still require separate evidence.

X posts remain separate from publisher news and official filings, and do not improve the verified data-coverage checklist.
The engine is instructed to treat post text and author biographies as untrusted, unverified supplementary discussion.
An X failure remains visible but does not block analysis from other sources.
Demo mode uses explicitly synthetic posts and makes no external calls.

At the current estimated rate, 10 returned posts cost up to $0.05 per fresh collection before filtering.
Ten companies collected once daily for 30 days would cost up to $15 for post reads at that rate, excluding other providers and any unknown failure billing.
Selecting new profile lookups adds up to $0.03 per company per run at the default cap and estimated profile rate, with cached profiles reused for free.
The analysis dialog includes that optional cost in its estimate.
The usage page estimates X spend from returned post and profile counts before filtering; cache hits are zero, and failed requests with unknown billing remain unknown.
Set a spending limit in the [X Developer Console](https://console.x.com/) to enforce your own monthly budget.
Current endpoint parameters and prices are documented in [recent search](https://docs.x.com/x-api/posts/search-recent-posts) and [X API pricing](https://docs.x.com/x-api/getting-started/pricing).

## Period-specific financial research

The financial provider reads the official SEC issuer index, Company Facts XBRL endpoint, submissions metadata, and selected HTML filings.
The input contains up to eight standalone quarterly periods, three annual periods, and two six-month cumulative periods, with exact fiscal start/end dates and currencies.
These counts are upper bounds, not guarantees of provider coverage.
Standard company-level US GAAP/IFRS concepts support revenue, gross/operating/net income, diluted EPS, operating cash flow, capital expenditure, cash, and selected long-term debt measures.
Unknown or unsupported values remain null; custom company/segment taxonomies and non-GAAP measures are not automatically normalized.
Long-term debt is not represented as a verified total of all borrowings.

Margins, free cash flow (operating cash flow minus capital expenditure), and comparable year-over-year changes are calculated in code.
Growth percentages require a positive prior-year base and compatible period durations/currencies.
Quarterly flows and fourth-quarter revenue can be derived from cumulative disclosures, retaining both filing references and a difference method.
Diluted EPS is never reconstructed by subtracting annual/cumulative values.
Latest known disclosures are selected as of the analysis date; future filings are excluded.
Restatements and values drawn from different filings can affect comparisons and are explicitly identified as limitations.
The snapshots retain source accession identifiers, concept names, URLs, publication dates, values, and derivation methods for auditing.

Official text is fetched only from validated SEC archive paths, with redirects disabled and bounded response sizes.
The latest quarterly and annual filings and an identifiable HTML earnings Exhibit 99.1 from an Item 2.02 8-K are candidates for extraction.
At most eight keyword-selected passages cover outlook, segments, risks, and operating results, with source links and truncation flags.
These are attributed excerpts, not generated summaries or a comprehensive report review.
Unidentified/PDF exhibits or unsuccessful extraction remain visible limitations; no management guidance is invented.
Recent official excerpts also contribute to the news context, while older report excerpts remain in the financial context.

Data coverage is independent of classification confidence.
The operational baseline requires at least four quarterly and two annual periods, a latest period no older than 150 days with revenue/EPS/operating cash flow, three potentially material news events from two publishers, and an official outlook excerpt.
Market opinions and uncategorized stories do not satisfy the news baseline; event categories remain explicit keyword heuristics, not independently verified materiality judgments.
Other contexts are labeled partial or limited, and classifications are provisional.
This is a coverage checklist, not a statistical quality score or a guarantee of investment suitability.
Annual-only/foreign reporting may remain partial despite valid documents.

## Database model

`Ticker` stores the unique normalized symbol, company name, exchange, enabled flag, and timestamps.
Disabling preserves saved history and excludes the ticker from daily and batch analysis.
V1 allows up to 50 enabled tickers.

`Analysis` is an immutable successful decision with confidence, summary, bullish/bearish factors, risks, quote/signals/fundamentals snapshot, news snapshot, original input, raw engine output, model version, rubric version, data mode, analysis day, and run reference.
Snapshots and external responses use JSONB; external data is not over-normalized.
Confidence is stored on a 0-1 scale and displayed as a percentage.

`AnalysisRun` captures the trigger, current/failure stage, status, start/finish times, lease expiry, warnings, partial context, raw engine output when available, and sanitized failure details.
An engine/API/validation failure never creates an `Analysis` row.

`ProviderCache` stores normalized reusable provider data and expiry.
`ApiUsage` records each network attempt and cache hit, ticker, run, provider, operation, duration, success/error code, reported tokens, and estimated variable cost.
`RateLimitBucket` coordinates the per-provider allowance across application instances.

## Jev behavior and explanation

The official documentation states that Jev produces typed decisions rather than generated text.
The adapter sends one bounded recommendation Choice plus independent Choices assessing evidence materiality and news direction.
It validates answer keys, all requested options, probability sums, selected maxima, and the documented Choice confidence formula.
Source facts that pass materiality/confidence checks are used to assemble the human-readable summary and factors in code.
The interface labels this provenance; it never presents fabricated model-authored reasoning.

BUY means sufficiently attractive risk/reward supported by material evidence.
HOLD means insufficient evidence to justify changing the current position, including incomplete or mixed evidence.
SELL means deterioration, excessive risk, or materially unfavorable risk/reward.
Confidence means concentration of the classification probability distribution, not expected return or a probability that the stock price will rise.
These confidence values have not been calibrated against future stock outcomes.

## Reliability and operating limits

A valid quote no older than seven days is required to classify a ticker.
Quotes older than four days produce a visible warning, allowing normal weekend/holiday gaps without disguising stale data.
History, news, trailing fundamentals, and financial reports are optional enrichment; failures are included in the input and displayed as data-quality risks.
Reported trailing metrics do not verify fiscal-period freshness or forward analyst revisions.
Historical bars are used for simple moving averages, approximate weekly/monthly changes, volume ratio, and recent annualized volatility.
V2 volume ratio uses the most recent completed historical session before the quote date, divided by the provider's daily average volume, with the session date and basis retained.
An opening-session cumulative quote volume is never compared directly with a full-day average.
V1 does not implement a technical-analysis engine or backtesting.

News candidates cover the last 30 days and selection is capped at 12 events, prioritizing earnings, guidance, regulation, and business developments over market opinions through explicit keyword heuristics.
URL canonicalization removes tracking parameters but preserves identity parameters such as Finnhub's `id`.
Similar syndicated headlines are grouped and retain up to four additional source URLs; grouped coverage does not independently verify a claim.
Summaries are bounded to 1,000 characters and are provider summaries, not full licensed article text.
The normalized V2 engine input is capped at 64,000 characters; an oversized context fails explicitly instead of silently discarding evidence.
Article and filing content is treated as untrusted evidence and is never executed or rendered as HTML.

Provider cache lifetimes are five minutes for quotes, 24 hours for history, 30 minutes for news, and 12 hours for fundamentals.
SEC enrichment is reused for six hours, the shared issuer index for 24 hours, and extracted passages from accession-specific documents for 30 days.
SEC calls use the conservative shared 50-requests-per-minute allowance, well below the documented 10-requests-per-second ceiling.
Financials and news use versioned cache keys so legacy truncated news is not reused by V2.
The Twelve Data free allowance is respected through a persisted conservative 61-second window.
Provider requests use 15-second timeouts, at most three attempts, exponential backoff with jitter, and bounded Retry-After handling.
Authentication, unknown-symbol, and invalid-payload errors are not retried.
Responses are bounded to two megabytes before JSON parsing.
No provider error silently becomes a BUY/HOLD/SELL classification.

PostgreSQL transaction-scoped advisory locks serialize acquisition per ticker.
A persisted ten-minute run lease prevents overlap across tabs, app processes, manual batches, and scheduled runs; expired leases are recovered on the next attempt.
Analysis completion checks the lease and updates the successful run plus immutable decision atomically.
Non-forced calls skip tickers with a successful analysis for the same UTC day, including an earlier manual run.
Failed attempts remain eligible to retry that day.
Re-analyze explicitly bypasses daily deduplication but never bypasses an active run.
Batch analysis handles tickers sequentially to respect free provider allowances, reports progress over NDJSON, and continues after individual failures.

## Daily analysis

Run a daily batch once:

```bash
pnpm analyze:daily
```

Start the lightweight scheduler in another terminal or managed process:

```bash
pnpm scheduler
```

It uses `DAILY_CRON` in UTC and prevents overlapping scheduler executions.
The default runs at 22:15 UTC on weekdays, after regular US market close, and does not implement an exchange-holiday calendar.
The application must remain running in a reliable host process; no browser session is required.
For more than a few tickers on free allowances, prefer the CLI/scheduler in a persistent Node.js host rather than a short-lived serverless request.

Alternatively, invoke `POST /api/cron/daily` with `Authorization: Bearer <CRON_SECRET>` from your cron system.
The HTTP cron endpoint never forces duplicate daily decisions.
Manual analysis is `POST /api/tickers/[symbol]/analyze` with JSON `{ "force": false }`; explicit reruns use `true`.
`POST /api/analyze` streams batch results and accepts the same force flag.

## Costs and official references

Provider choices were checked against official documentation on October 5, 2026.

- [TypeSafe JavaScript SDK](https://docs.typesafe.ai/sdk/javascript) and [HTTP API](https://docs.typesafe.ai/api): official `@typesafe-ai/sdk`, System One endpoint, and bounded Choice questions.
- [Jev models and pricing](https://docs.typesafe.ai/models): Jev 1.13 at $0.042 per million input tokens, with free output tokens.
- [Jev confidence](https://docs.typesafe.ai/confidence) and [documented limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13): keep arithmetic in code and account for uncertainty.
- [Twelve Data plans](https://support.twelvedata.com/en/articles/5335783-trial) and [stock data](https://twelvedata.com/stocks/): Basic free tier currently advertises 8 credits/minute and 800/day, with US market access subject to plan entitlements.
- [Finnhub company-news API](https://finnhub.io/docs/api/company-news), [basic financials API](https://finnhub.io/docs/api/company-basic-financials), and [pricing](https://finnhub.io/pricing): company-scoped news and trailing metrics through a personal-use account; check your account's current free access and licensing.
- [SEC data APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) and [fair access](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data): free official filings and standard XBRL facts, with a declared contact and request-rate limits.

At 5,000 billed Jev input tokens per analysis, variable Jev cost is about $0.00021 per ticker, or $0.0378 for six tickers analyzed daily for 30 days.
Actual usage depends on context and question count; the UI uses returned billing tokens rather than a character-count guess.
Each uncached analysis normally makes two Twelve Data calls, two Finnhub calls, and one Jev request.
SEC enrichment adds issuer lookup (shared), facts, submissions, up to three document requests, and an optional earnings-exhibit index request when caches are cold.
SEC requests have no API fee; the larger bounded V2 context can increase billed Jev input tokens and the actual returned usage remains observable.
The usage view reports ticker totals, daily/monthly estimates, mean cost per saved analysis, cache reuse, failed attempts, and missing billing information.
Subscriptions, hosting, and upstream charges for timed-out requests without returned usage are excluded and explicitly identified.
Costs are estimates, not billing reconciliation.
Do not publicly redistribute market/news data without appropriate provider licensing.

## Verify

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:integration
pnpm test:integration:db
pnpm test:integration:ai
pnpm test:e2e:ai
```

Domain tests cover period normalization, cumulative cash-flow derivation, fourth-quarter reconstruction, EPS safety, currencies, restatements/as-of filtering, bounded source excerpts, coverage, news identity, confidence/output validation, partial failures, successful persistence, duplicate daily prevention, retries after failure, active-run exclusion, and batch isolation.
Browser tests exercise the complete user workflow, dark/light themes, responsive layout, PostgreSQL concurrency, unknown tickers, input validation, origin checks, and lease recovery.
Provider integration exercises real SDK serialization and all live adapters against deterministic HTTP fixtures with actual PostgreSQL cache, throttle, usage, and failure persistence.
Snapshot integration tests create a separate database, apply the initial application migration and a fixture migration through Prisma, restore the pre-migration snapshot, and verify that the migration can be applied again.
They also check safety snapshots, corruption rejection, failed-restore preservation, concurrent-operation refusal, and archive permissions.
AI tests cover authenticated encryption, response bounds, provider serialization, invalid outputs, token usage, settings persistence, model-scoped deduplication, key replacement/deletion, and the browser settings workflow.
No tests call paid APIs.
The test setup creates and migrates a dedicated database ending in `_test`; only that isolated database is reset by browser tests.
Run browser and provider integration tests sequentially because they share this test database.
ESLint 10 uses the official `@eslint/compat` bridge for Next.js plugins that still target the ESLint 9 rule API.

## Production

Set all live keys, `DEMO_MODE=false`, and a random `APP_PASSWORD` of at least 16 characters.
Apply migrations with `pnpm prisma migrate deploy`, then run `pnpm build` and `pnpm start`.
Use username `personal` for the browser's HTTP Basic prompt.
Production requests are rejected if the password is not configured, and anonymous development access is restricted to localhost.
Deploy behind HTTPS and a reverse proxy when remote access is needed, and set `APP_ORIGIN` to the public origin.
Unsafe cross-origin writes and non-JSON mutation requests are rejected.
The cron endpoint authenticates independently with its longer secret.
Back up PostgreSQL and supervise the app/scheduler processes on a persistent Node.js host.
No queues, subscriptions, portfolio accounting, automated trading, or complex multi-user authentication are included.

This application provides AI-assisted analysis for informational purposes only.
It does not constitute financial advice.
