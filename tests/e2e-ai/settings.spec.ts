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
    const response = await page.goto("/settings");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["www-authenticate"]).toBeUndefined();
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
    await page.locator("#openai-model").selectOption("gpt-4.1");
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
test("shows all suggested models and persists custom IDs for each AI provider", async ({
  page,
}) => {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query('DELETE FROM "AiProviderConfig"');
    await client.query('DELETE FROM "AiSettings"');
    await page.goto("/settings");
    for (const { provider, label, models, custom } of [
      {
        provider: "openai",
        label: "OpenAI",
        models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"],
        custom: "openai-custom-fixture",
      },
      {
        provider: "deepseek",
        label: "DeepSeek",
        models: ["deepseek-chat", "deepseek-reasoner"],
        custom: "deepseek-custom-fixture",
      },
      {
        provider: "anthropic",
        label: "Claude (Anthropic)",
        models: ["claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001"],
        custom: "claude-custom-fixture",
      },
    ]) {
      const card = page
        .locator("form")
        .filter({ has: page.getByRole("heading", { name: label, exact: true }) });
      const select = card.getByRole("combobox", { name: "Model", exact: true });
      await expect(select.locator("option")).toHaveText([...models, "Custom model…"]);
      const preset = models[models.length - 1];
      await select.selectOption(preset);
      await page.locator(`#${provider}-key`).fill(secret);
      await card.getByRole("button", { name: "Save", exact: true }).click();
      await expect(card.getByText("Saved key: ••••-key", { exact: true })).toBeVisible();
      await page.reload();
      await expect(select).toHaveValue(preset);

      await select.selectOption("custom");
      const customInput = card.getByRole("textbox", { name: "Custom model ID", exact: true });
      await customInput.fill(custom);
      await select.selectOption(models[0]);
      await expect(customInput).toHaveCount(0);
      await select.selectOption("custom");
      await expect(customInput).toHaveValue(custom);
      await card.getByRole("button", { name: "Save", exact: true }).click();
      await expect
        .poll(
          async () =>
            (
              await client.query('SELECT model FROM "AiProviderConfig" WHERE provider = $1', [
                provider,
              ])
            ).rows[0]?.model,
        )
        .toBe(custom);
      await page.reload();
      await expect(select).toHaveValue("custom");
      await expect(customInput).toHaveValue(custom);
      await expect(page.locator(`#${provider}-key`)).toHaveValue("");

      await select.selectOption(preset);
      await card.getByRole("button", { name: "Save", exact: true }).click();
      await expect
        .poll(
          async () =>
            (
              await client.query('SELECT model FROM "AiProviderConfig" WHERE provider = $1', [
                provider,
              ])
            ).rows[0]?.model,
        )
        .toBe(preset);
      await expect(customInput).toHaveCount(0);
    }
  } finally {
    await client.query('DELETE FROM "AiProviderConfig"');
    await client.query('DELETE FROM "AiSettings"');
    await client.end();
  }
});
test("allows settings access without credentials and rejects cross-origin writes", async ({
  page,
}) => {
  const settings = await page.request.get("/api/settings/ai");
  expect(settings.status()).toBe(200);
  expect(settings.headers()["www-authenticate"]).toBeUndefined();
  expect((await settings.json()).canStoreKeys).toBe(true);
  const crossOrigin = await page.request.put("/api/settings/ai", {
    headers: { origin: "https://attacker.example" },
    data: { provider: "openai", model: "gpt-4.1-mini", apiKey: secret },
  });
  expect(crossOrigin.status()).toBe(403);
});
