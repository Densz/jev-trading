import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { testDatabaseUrl } from "./scripts/test-database";
const password = "ai-browser-fixture-password-only";
export default defineConfig({
  testDir: "./tests/e2e-ai",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3101",
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    httpCredentials: { username: "personal", password },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm test:db && pnpm exec next dev --hostname 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101",
    // HTTP Basic deliberately returns 401 until a browser supplies credentials.
    timeout: 120000,
    env: {
      DATABASE_URL: testDatabaseUrl(),
      TEST_DATABASE_URL: testDatabaseUrl(),
      DEMO_MODE: "true",
      APP_PASSWORD: password,
      API_KEY_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      TYPESAFE_API_KEY: "",
      APP_ORIGIN: "",
      CRON_SECRET: "",
      NEXT_BUILD_DIR: ".next-ai-e2e",
    },
  },
});
