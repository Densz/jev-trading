import { defineConfig } from "@playwright/test";
import { testDatabaseUrl } from "./scripts/test-database";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm test:db && pnpm exec next dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      DATABASE_URL: testDatabaseUrl(),
      TEST_DATABASE_URL: testDatabaseUrl(),
      DEMO_MODE: "true",
      APP_PASSWORD: "",
      CRON_SECRET: "",
      APP_ORIGIN: "",
      NEXT_BUILD_DIR: ".next-e2e",
      FORCE_COLOR: "0",
    },
  },
});
