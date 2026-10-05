import { Client } from "pg";
import { spawnSync } from "node:child_process";
import { testDatabaseUrl } from "./test-database";
const url = new URL(testDatabaseUrl());
const databaseName = url.pathname.slice(1);
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const client = new Client({ connectionString: adminUrl.toString() });
try {
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (!exists.rowCount) await client.query(`CREATE DATABASE "${databaseName}"`);
} finally {
  await client.end();
}
const migration = spawnSync("pnpm", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url.toString() },
});
if (migration.status !== 0) process.exit(migration.status ?? 1);
