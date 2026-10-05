import "dotenv/config";
import cron from "node-cron";
import { analyzeAllEnabledTickers } from "../src/server/analysis-service";
import { getEnv } from "../src/server/env";
import { db } from "../src/db/client";

const schedule = getEnv().DAILY_CRON;
if (!cron.validate(schedule)) throw new Error("DAILY_CRON must be a valid cron expression.");
const task = cron.schedule(
  schedule,
  async () => {
    try {
      console.info(
        JSON.stringify({ event: "scheduled_analysis", results: await analyzeAllEnabledTickers() }),
      );
    } catch {
      console.error("Scheduled analysis could not complete. Check database connectivity.");
    }
  },
  { timezone: "UTC", noOverlap: true },
);
console.info(`Daily analysis scheduled: ${schedule} (UTC)`);
async function stop() {
  await task.stop();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
