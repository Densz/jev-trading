import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { testDatabaseUrl } from "../../scripts/test-database";

test.beforeEach(async () => {
  const client = new Client({ connectionString: testDatabaseUrl() });
  try {
    await client.connect();
    // Only this isolated test database is reset. Production/development data is never touched.
    await client.query(
      'TRUNCATE "ApiUsage", "Analysis", "AnalysisRun", "Ticker", "ProviderCache", "RateLimitBucket" CASCADE',
    );
  } finally {
    await client.end();
  }
});
async function addTicker(page: Page, symbol: string) {
  await page.getByRole("button", { name: "Add ticker", exact: true }).click();
  await page.getByLabel("Stock symbol").fill(symbol);
  await page.getByRole("dialog").getByRole("button", { name: "Add ticker", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`${symbol} `) }).first()).toBeVisible();
}

test("individual browser analysis works on the loopback IP without APP_ORIGIN", async ({
  page,
  request,
}) => {
  expect((await request.post("/api/tickers", { data: { symbol: "NVDA" } })).status()).toBe(201);
  await page.goto("/");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/tickers/NVDA/analyze") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Analyze NVDA", exact: true }).click();
  const response = await responsePromise;
  expect(await response.request().headerValue("origin")).toBe("http://127.0.0.1:3100");
  expect(response.status()).toBe(200);
  await expect(page.getByText("NVDA analysis saved.")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "NVDA" })).toContainText("HOLD");
});

test("complete research workflow persists analyses and preserves disabled ticker history", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByText("Demo mode: all prices, news, and recommendations are synthetic.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Start with the companies you follow." }),
  ).toBeVisible();
  for (const symbol of ["AAPL", "NVDA", "MSFT", "GOOGL", "AMZN", "TSLA"])
    await addTicker(page, symbol);
  await page.getByRole("button", { name: "Analyze all", exact: true }).click();
  await expect(page.getByRole("button", { name: /Analyzing \d\/6/ })).toBeDisabled();
  await expect(page.getByText("6 analyses saved.")).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("row").filter({ hasText: "AAPL" })).toContainText("BUY");
  await expect(page.getByRole("row").filter({ hasText: "NVDA" })).toContainText("HOLD");
  await expect(page.getByRole("row").filter({ hasText: "TSLA" })).toContainText("SELL");
  await page.screenshot({ path: "/private/tmp/jev-dashboard-dark.png", fullPage: true });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.screenshot({
    path: "/private/tmp/jev-dashboard-light.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.getByRole("link", { name: "Open AAPL details" }).click();
  await expect(page.getByRole("heading", { name: "AAPL", exact: true })).toBeVisible();
  await expect(page.getByText("82", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bullish factors" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Financial statements", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Data coverage", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Official filing excerpts", exact: true }),
  ).toBeVisible();
  await page.getByText("Inspect normalized input & engine output").click();
  await expect(page.getByText('"rubricVersion": "thesis-v2"', { exact: false })).toBeVisible();
  await page.getByText("Inspect normalized input & engine output").click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "/private/tmp/jev-ticker-detail.png", fullPage: true });
  await page.getByRole("button", { name: "Re-analyze", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Re-analyze", exact: true }).click();
  await expect(page.getByText("AAPL analysis saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Saved analysis history" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Saved analysis history" }).getByRole("row"),
  ).toHaveCount(3);
  await page.getByRole("link", { name: "Back to watchlist" }).click();
  await page.getByRole("button", { name: "Disable AAPL", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Disable ticker" }).click();
  await expect(page.getByRole("row").filter({ hasText: "AAPL" })).toHaveCount(0);
  await page.getByRole("button", { name: "Show disabled (1)" }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "AAPL" })
    .getByRole("button", { name: "Enable" })
    .click();
  await expect(page.getByRole("button", { name: "Analyze AAPL" })).toBeEnabled();
  await page.getByLabel("Search watchlist").fill("TSLA");
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByLabel("Search watchlist").fill("");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/private/tmp/jev-dashboard-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test("financial research stays readable on mobile and legacy snapshots remain immutable", async ({
  page,
  request,
}) => {
  await request.post("/api/tickers", { data: { symbol: "NVDA" } });
  await request.post("/api/tickers/NVDA/analyze", { data: {} });
  await page.goto("/tickers/NVDA");
  await expect(
    page.getByRole("heading", { name: "Financial statements", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Quarterly results", { exact: false }).first()).toContainText(
    "8 periods",
  );
  await page.locator("summary").filter({ hasText: "Annual results" }).click();
  await expect(page.getByText("Annual results", { exact: false }).first()).toContainText(
    "3 periods",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/private/tmp/jev-financial-research-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "/private/tmp/jev-financial-research-mobile.png", fullPage: true });
  const client = new Client({ connectionString: testDatabaseUrl() });
  let id: string;
  try {
    await client.connect();
    const row = (await client.query('SELECT id, "analysisInput" FROM "Analysis" LIMIT 1')).rows[0];
    id = row.id;
    const legacy = { ...row.analysisInput, version: "1", rubricVersion: "thesis-v1" };
    delete legacy.financialReports;
    delete legacy.dataQuality;
    delete legacy.newsEvents;
    await client.query(
      'UPDATE "Analysis" SET "analysisInput" = $1::jsonb, "rubricVersion" = $2 WHERE id = $3',
      [JSON.stringify(legacy), "thesis-v1", id],
    );
  } finally {
    await client.end();
  }
  await page.goto(`/tickers/NVDA?analysis=${id!}`);
  await expect(
    page
      .getByRole("region", { name: "Data coverage" })
      .getByText("Legacy V1 analysis:", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Financial statements", exact: true }),
  ).toHaveCount(0);
});

test("daily deduplication and concurrent requests use actual PostgreSQL locks", async ({
  request,
}) => {
  expect((await request.post("/api/tickers", { data: { symbol: "AAPL" } })).status()).toBe(201);
  const first = await request.post("/api/tickers/AAPL/analyze", { data: {} });
  expect((await first.json()).status).toBe("succeeded");
  const second = await request.post("/api/tickers/AAPL/analyze", { data: {} });
  expect((await second.json()).status).toBe("skipped");
  const responses = await Promise.all([
    request.post("/api/tickers/AAPL/analyze", { data: { force: true } }),
    request.post("/api/tickers/AAPL/analyze", { data: { force: true } }),
  ]);
  expect((await Promise.all(responses.map((r) => r.json()))).map((r) => r.status).sort()).toEqual([
    "running",
    "succeeded",
  ]);
  const client = new Client({ connectionString: testDatabaseUrl() });
  try {
    await client.connect();
    expect(
      (await client.query('SELECT count(*)::int AS count FROM "Analysis"')).rows[0].count,
    ).toBe(2);
  } finally {
    await client.end();
  }
});

test("unknown tickers, invalid inputs, and cross-origin writes fail safely", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add ticker", exact: true }).click();
  await page.getByLabel("Stock symbol").fill("INVALID");
  await page.getByRole("dialog").getByRole("button", { name: "Add ticker", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("synthetic workspace supports");
  expect((await request.post("/api/tickers", { data: { symbol: "../BAD" } })).status()).toBe(400);
  expect(
    (
      await request.post("/api/tickers", {
        data: { symbol: "AAPL" },
        headers: { Origin: "https://attacker.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/tickers", {
        data: { symbol: "AAPL" },
        headers: { Origin: "http://localhost:3100" },
      })
    ).status(),
  ).toBe(403);
  expect((await request.post("/api/cron/daily", { data: {} })).status()).toBe(503);
  expect((await request.post("/api/tickers/MSFT/analyze", { data: {} })).status()).toBe(404);
});

test("interrupted run leases recover without losing existing analyses", async ({ request }) => {
  await request.post("/api/tickers", { data: { symbol: "MSFT" } });
  const client = new Client({ connectionString: testDatabaseUrl() });
  try {
    await client.connect();
    await client.query(
      `INSERT INTO "AnalysisRun" (id, "tickerId", status, stage, trigger, "dataMode", "startedAt", "expiresAt") SELECT 'interrupted-fixture', id, 'RUNNING', 'decision', 'daily', 'demo', now() - interval '15 minutes', now() - interval '5 minutes' FROM "Ticker" WHERE symbol = 'MSFT'`,
    );
    expect(
      (await (await request.post("/api/tickers/MSFT/analyze", { data: {} })).json()).status,
    ).toBe("succeeded");
    const failed = await client.query(
      'SELECT status, "errorCode" FROM "AnalysisRun" WHERE id = $1',
      ["interrupted-fixture"],
    );
    expect(failed.rows[0]).toEqual({ status: "FAILED", errorCode: "INTERRUPTED" });
  } finally {
    await client.end();
  }
});
