import "dotenv/config";
// Run standalone server modules under Node's react-server export condition.
import { analyzeAllEnabledTickers } from "../src/server/analysis-service";
import { db } from "../src/db/client";

try {
  const results = await analyzeAllEnabledTickers();
  console.info(JSON.stringify({ event: "daily_complete", results }));
  if (results.some((r) => r.status === "failed")) process.exitCode = 1;
} catch {
  console.error("Daily analysis failed. Check database connectivity and configuration.");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
