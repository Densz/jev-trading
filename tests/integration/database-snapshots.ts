import "dotenv/config";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { localDatabaseConfiguration } from "../../scripts/local-database";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const configuration = localDatabaseConfiguration();
const databaseName = `jev_snapshots_${randomBytes(6).toString("hex")}_test`;
const url = new URL("postgresql://localhost");
url.hostname = configuration.host;
url.port = String(configuration.port);
url.username = configuration.user;
url.password = configuration.password;
url.pathname = `/${databaseName}`;
const admin = new Client({ ...configuration, database: "postgres" });
await mkdir(join(root, ".db-backups"), { recursive: true, mode: 0o700 });
const directory = await mkdtemp(join(root, ".db-backups", "integration-"));
const backupDirectory = join(directory, "snapshots");
const migrations = join(directory, "migrations");
const prismaConfig = join(directory, "prisma.config.ts");
const env = { ...process.env, DATABASE_URL: url.toString(), JEV_DB_BACKUP_DIR: backupDirectory };
const initialMigration = "20261005141412_init";
const fixtureMigration = "20990101000000_snapshot_fixture";

async function command(args: string[]) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolveResult, reject) => {
      const child = spawn("pnpm", args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      child.on("error", reject);
      child.on("close", (code) => resolveResult({ code, stdout, stderr }));
    },
  );
}
async function succeeds(args: string[]) {
  const result = await command(args);
  assert.equal(result.code, 0, `${args.join(" ")} failed:\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}
async function query(sql: string) {
  const client = new Client({ connectionString: url.toString() });
  try {
    await client.connect();
    return await client.query(sql);
  } finally {
    await client.end();
  }
}
async function state() {
  return {
    name: (await query("SELECT name FROM \"Ticker\" WHERE symbol = 'AAPL'")).rows[0].name,
    migrationTable: (await query("SELECT to_regclass('public.\"SnapshotMigration\"') AS name"))
      .rows[0].name,
    migrations: (
      await query('SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name')
    ).rows.map((row) => row.migration_name),
    sequence: (await query('SELECT last_value::int FROM "SnapshotSequence_id_seq"')).rows[0]
      .last_value,
  };
}

let created = false;
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  await cp(join(root, "prisma/migrations", initialMigration), join(migrations, initialMigration), {
    recursive: true,
  });
  await cp(
    join(root, "prisma/migrations/migration_lock.toml"),
    join(migrations, "migration_lock.toml"),
  );
  await writeFile(
    prismaConfig,
    `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(join(root, "prisma/schema.prisma"))}, migrations: { path: ${JSON.stringify(migrations)} }, datasource: { url: process.env.DATABASE_URL! } });\n`,
  );
  await succeeds(["exec", "prisma", "migrate", "deploy", "--config", prismaConfig]);
  await query(`INSERT INTO "Ticker" (id, symbol, name, exchange, "updatedAt") VALUES ('snapshot-fixture', 'AAPL', 'Before migration', 'NASDAQ', now());
    CREATE TABLE "SnapshotSequence" (id serial PRIMARY KEY);
    INSERT INTO "SnapshotSequence" DEFAULT VALUES;`);
  const before = await state();
  assert.deepEqual(before, {
    name: "Before migration",
    migrationTable: null,
    migrations: [initialMigration],
    sequence: 1,
  });

  const output = await succeeds(["db:backup", "before-test-migration"]);
  const backup = /Backup created: (.+)/.exec(output)?.[1];
  assert.ok(backup, output);
  const info = JSON.parse(await readFile(`${backup}.info.json`, "utf8"));
  assert.equal(info.database, databaseName);
  assert.match(info.sha256, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(info).includes(configuration.password));
  for (const file of [backup, `${backup}.info.json`])
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal((await stat(backupDirectory)).mode & 0o777, 0o700);
  assert.ok((await succeeds(["db:backups"])).includes(`${backup} (latest)`));

  await mkdir(join(migrations, fixtureMigration));
  await writeFile(
    join(migrations, fixtureMigration, "migration.sql"),
    'ALTER TABLE "Ticker" ADD COLUMN "snapshotNote" TEXT;\nCREATE TABLE "SnapshotMigration" (id TEXT PRIMARY KEY, value TEXT NOT NULL);\n',
  );
  await succeeds(["exec", "prisma", "migrate", "deploy", "--config", prismaConfig]);
  await query(`UPDATE "Ticker" SET name = 'After migration';
    INSERT INTO "SnapshotSequence" DEFAULT VALUES;
    INSERT INTO "SnapshotMigration" (id, value) VALUES ('snapshot-fixture', 'post-migration-data');`);
  const after = await state();
  assert.deepEqual(after, {
    name: "After migration",
    migrationTable: '"SnapshotMigration"',
    migrations: [initialMigration, fixtureMigration],
    sequence: 2,
  });

  const noConfirmation = await command(["db:restore"]);
  assert.notEqual(noConfirmation.code, 0);
  assert.match(noConfirmation.stderr, /interactive terminal/);
  assert.deepEqual(await state(), after);

  const activeConnection = new Client({ connectionString: url.toString() });
  let disconnected = false;
  activeConnection.on("error", () => {
    disconnected = true;
  });
  let restored: string;
  try {
    await activeConnection.connect();
    restored = await succeeds(["db:restore", "latest", "--yes"]);
    assert.equal(
      disconnected,
      true,
      "Restore must disconnect existing clients before replacing the database",
    );
  } finally {
    await activeConnection.end();
  }
  const safety = /Safety snapshot: (.+)/.exec(restored)?.[1];
  assert.ok(safety, restored);
  assert.deepEqual(
    await state(),
    before,
    "Restore must revert data, schema, sequences and Prisma migration history",
  );
  assert.ok((await succeeds(["db:backups"])).includes(`${backup} (latest)`));

  await succeeds(["db:restore", safety, "--yes"]);
  assert.deepEqual(await state(), after, "The automatic safety snapshot must undo a restore");
  assert.equal(
    (await query('SELECT value FROM "SnapshotMigration"')).rows[0].value,
    "post-migration-data",
  );

  const corrupt = join(backupDirectory, "corrupt.dump");
  const archive = await readFile(backup);
  await writeFile(corrupt, Buffer.concat([archive, Buffer.from("tampered")]));
  await cp(`${backup}.info.json`, `${corrupt}.info.json`);
  const invalidChecksum = await command(["db:restore", corrupt, "--yes"]);
  assert.notEqual(invalidChecksum.code, 0);
  assert.match(invalidChecksum.stderr, /checksum does not match/);
  assert.deepEqual(await state(), after);

  await writeFile(
    `${corrupt}.info.json`,
    JSON.stringify({ ...info, database: "another_database" }),
  );
  const wrongDatabase = await command(["db:restore", corrupt, "--yes"]);
  assert.notEqual(wrongDatabase.code, 0);
  assert.match(wrongDatabase.stderr, /belongs to/);
  assert.deepEqual(await state(), after);

  // Keep the archive's table of contents but truncate its data. Its checksum is valid,
  // so this exercises a failure while restoring the temporary database.
  const truncated = archive.subarray(0, archive.length - 100);
  await writeFile(corrupt, truncated);
  await writeFile(
    `${corrupt}.info.json`,
    JSON.stringify({ ...info, sha256: createHash("sha256").update(truncated).digest("hex") }),
  );
  const failedPreparation = await command(["db:restore", corrupt, "--yes"]);
  assert.notEqual(failedPreparation.code, 0);
  assert.match(failedPreparation.stdout, /Restoring into a temporary database/);
  assert.deepEqual(await state(), after, "A failed preparation must preserve the active database");

  await admin.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [
    `jev-trading:snapshots:${databaseName}`,
  ]);
  try {
    for (const args of [["db:backup"], ["db:restore", "latest", "--yes"]]) {
      const locked = await command(args);
      assert.notEqual(locked.code, 0);
      assert.match(locked.stderr, /Another backup or restore/);
    }
  } finally {
    await admin.query("SELECT pg_advisory_unlock_all()");
  }

  await succeeds(["db:restore", "latest", "--yes"]);
  assert.deepEqual(await state(), before);
  await succeeds(["exec", "prisma", "migrate", "deploy", "--config", prismaConfig]);
  const reapplied = await state();
  assert.equal(
    reapplied.migrationTable,
    '"SnapshotMigration"',
    "A reverted Prisma migration must be deployable again",
  );
  assert.deepEqual(reapplied.migrations, [initialMigration, fixtureMigration]);
  const remainingTemporaryDatabases = (
    await admin.query("SELECT datname FROM pg_database WHERE datname ~ $1", [
      `^${databaseName.slice(0, 36)}_(restore|previous)_[0-9a-f]+$`,
    ])
  ).rows
    .map((row) => row.datname)
    .sort();
  assert.deepEqual(remainingTemporaryDatabases, []);
  console.info(
    "Database snapshot integration passed: migration rollback/reapply, full data/schema/sequence restore, safety undo, permissions, checksum rejection, database isolation, failed-restore preservation and concurrency lock.",
  );
} finally {
  if (created) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await admin.end();
  await rm(directory, { recursive: true, force: true });
}
