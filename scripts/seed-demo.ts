import "dotenv/config";
import { db } from "../src/db/client";
import { getEnv } from "../src/server/env";
import { demoCompanies } from "../src/lib/demo/providers";
import { analysisService } from "../src/server/analysis-service";
if (!getEnv().DEMO_MODE)
  throw new Error(
    "Demo seeding requires DEMO_MODE=true. Live mode is never seeded with synthetic data.",
  );
try {
  for (const [symbol, company] of Object.entries(demoCompanies)) {
    await db.ticker.upsert({
      where: { symbol },
      create: { symbol, name: company.name, exchange: "NASDAQ" },
      update: {},
    });
    console.info(
      JSON.stringify(await analysisService().analyzeTicker(symbol, { trigger: "demo-seed" })),
    );
  }
} finally {
  await db.$disconnect();
}
