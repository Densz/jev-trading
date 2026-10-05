import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { testDatabaseUrl } from "../../scripts/test-database";
const secret = "browser-fixture-key-not-a-real-api-key";
test("encrypts keys, masks responses, selects defaults and supports replacement/deletion", async ({
  page,
}, testInfo) => {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query('DELETE FROM "AiProviderConfig"');
    await client.query('DELETE FROM "AiSettings"');
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "AI settings", exact: true })).toBeVisible();
    await page.locator("#openai-key").fill(secret);
    const openai = page
      .locator("form")
      .filter({ has: page.getByRole("heading", { name: "OpenAI", exact: true }) });
    await openai.getByRole("button", { name: "Save", exact: true }).click();
    await expect(openai.getByText("Saved key: ••••-key", { exact: true })).toBeVisible();
    await expect(page.locator("#openai-key")).toHaveValue("");
    const stored = (
      await client.query('SELECT "encryptedApiKey" FROM "AiProviderConfig" WHERE "provider" = $1', [
        "openai",
      ])
    ).rows[0].encryptedApiKey;
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain(secret);
    const metadata = await (await page.request.get("/api/settings/ai")).text();
    expect(metadata).not.toContain(secret);
    expect(metadata).not.toContain(stored);
    expect(metadata).not.toContain("encryptedApiKey");
    await page.locator("#openai-model").fill("gpt-4.1");
    await openai.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "AI settings saved" })).toBeVisible();
    const kept = (
      await client.query(
        'SELECT "encryptedApiKey", "model" FROM "AiProviderConfig" WHERE "provider" = $1',
        ["openai"],
      )
    ).rows[0];
    expect(kept.encryptedApiKey).toBe(stored);
    expect(kept.model).toBe("gpt-4.1");
    await page.locator("#default-provider").selectOption("openai");
    await expect
      .poll(
        async () =>
          (
            await client.query('SELECT "defaultProvider" FROM "AiSettings" WHERE "id" = $1', [
              "workspace",
            ])
          ).rows[0]?.defaultProvider,
      )
      .toBe("openai");
    await expect(openai.getByRole("button", { name: "Test", exact: true })).toBeDisabled();
    const noDemoCall = await page.request.post("/api/settings/ai", {
      data: { provider: "openai" },
    });
    expect(noDemoCall.status()).toBe(400);
    expect((await noDemoCall.json()).code).toBe("DEMO_MODE");
    await page.locator("#openai-key").fill("browser-replacement-fixture");
    await openai.getByRole("button", { name: "Save", exact: true }).click();
    await expect(openai.getByText("Saved key: ••••ture", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("ai-settings-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("ai-settings-mobile.png"), fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await openai.getByRole("button", { name: "Delete OpenAI key" }).click();
    await expect(openai.getByText("No key configured", { exact: true })).toBeVisible();
    await expect(page.locator("#default-provider")).toHaveValue("jev");
    expect(
      (await client.query('SELECT * FROM "AiProviderConfig" WHERE "provider" = $1', ["openai"]))
        .rowCount,
    ).toBe(0);
  } finally {
    await client.end();
  }
});
test("protects settings from unauthorized and cross-origin writes", async ({
  page,
  playwright,
}) => {
  // Explicitly override the runner's default httpCredentials for this isolated client.
  const anonymous = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3101",
    httpCredentials: { username: "", password: "" },
  });
  try {
    expect((await anonymous.get("/api/settings/ai")).status()).toBe(401);
    expect(
      (
        await anonymous.put("/api/settings/ai", {
          data: { provider: "openai", model: "gpt-4.1-mini", apiKey: secret },
        })
      ).status(),
    ).toBe(401);
  } finally {
    await anonymous.dispose();
  }
  const crossOrigin = await page.request.put("/api/settings/ai", {
    headers: { origin: "https://attacker.example" },
    data: { provider: "openai", model: "gpt-4.1-mini", apiKey: secret },
  });
  expect(crossOrigin.status()).toBe(403);
});
