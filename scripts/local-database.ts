import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, mkdir, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { z } from "zod";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultUrl = "postgresql://jev:jev_local_password@127.0.0.1:5434/jev";
const infoSchema = z.object({
  version: z.literal(1),
  database: z.string(),
  createdAt: z.iso.datetime(),
  label: z.string(),
  gitBranch: z.string(),
  gitCommit: z.string(),
  gitDirty: z.boolean(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

function identifier(value: string) {
  if (!/^[a-zA-Z0-9_]{1,63}$/.test(value))
    throw new Error("Database and user names must contain only letters, digits or underscores.");
  return `"${value}"`;
}

export function localDatabaseConfiguration(env: Record<string, string | undefined> = process.env) {
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL ?? defaultUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid local PostgreSQL URL.");
  }
  if (
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error("Database snapshots only support the local Docker Compose PostgreSQL.");
  const database = decodeURIComponent(url.pathname.slice(1));
  const user = decodeURIComponent(url.username);
  identifier(database);
  identifier(user);
  if (["postgres", "template0", "template1"].includes(database))
    throw new Error("System databases cannot be backed up or replaced with these commands.");
  return {
    database,
    user,
    password: decodeURIComponent(url.password),
    host: url.hostname === "[::1]" ? "::1" : url.hostname,
    port: Number(url.port || 5432),
    backupDirectory: resolve(repositoryRoot, env.JEV_DB_BACKUP_DIR ?? ".db-backups"),
  };
}
type Configuration = ReturnType<typeof localDatabaseConfiguration>;

async function run(
  command: string,
  args: string[],
  files: { input?: string; output?: string; signal?: AbortSignal } = {},
) {
  const input = files.input ? await open(files.input, "r") : undefined;
  let output: Awaited<ReturnType<typeof open>> | undefined;
  try {
    output = files.output ? await open(files.output, "wx", 0o600) : undefined;
    return await new Promise<string>((resolveResult, reject) => {
      const child = spawn(command, args, {
        cwd: repositoryRoot,
        stdio: [input?.fd ?? "ignore", output?.fd ?? "pipe", "pipe"],
        signal: files.signal,
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-16000);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolveResult(stdout.trim());
        else reject(new Error(`${command} failed: ${stderr.trim() || `exit code ${code}`}`));
      });
    });
  } finally {
    await input?.close();
    await output?.close();
  }
}

async function checksum(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export class LocalDatabase {
  private container = "";
  constructor(
    readonly configuration: Configuration,
    private signal?: AbortSignal,
  ) {}

  private get latestFile() {
    return join(this.configuration.backupDirectory, `${this.configuration.database}.latest`);
  }

  private async prepareDirectory() {
    await mkdir(this.configuration.backupDirectory, { recursive: true, mode: 0o700 });
    await chmod(this.configuration.backupDirectory, 0o700);
  }

  async resolveBackup(requested = "latest") {
    if (requested === "latest") {
      let filename;
      try {
        filename = (await readFile(this.latestFile, "utf8")).trim();
      } catch {
        throw new Error("No latest snapshot found. Create one with: pnpm db:backup");
      }
      if (basename(filename) !== filename || !filename.endsWith(".dump"))
        throw new Error("The latest snapshot pointer is invalid.");
      return join(this.configuration.backupDirectory, filename);
    }
    return resolve(repositoryRoot, requested);
  }

  async list() {
    let files: string[];
    try {
      files = await readdir(this.configuration.backupDirectory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      files = [];
    }
    const latest = await this.resolveBackup().catch(() => "");
    const snapshots = files
      .filter(
        (file) => file.startsWith(`${this.configuration.database}_`) && file.endsWith(".dump"),
      )
      .sort()
      .reverse();
    if (!snapshots.length) console.info("No local database snapshots found.");
    for (const file of snapshots) {
      const path = join(this.configuration.backupDirectory, file);
      console.info(`${path}${path === latest ? " (latest)" : ""}`);
    }
  }

  private async connect() {
    const compose = ["compose", "--file", join(repositoryRoot, "docker-compose.yml")];
    this.container = await run("docker", [...compose, "ps", "--quiet", "postgres"]);
    if (!/^[a-f0-9]+$/.test(this.container))
      throw new Error("Local PostgreSQL is stopped. Run: docker compose up -d postgres");
    const ports = await run("docker", ["port", this.container, "5432/tcp"]);
    const expectedPort = this.configuration.port;
    if (
      !ports.split("\n").some((port) => {
        const match = /^(127\.0\.0\.1|\[::1\]):(\d+)$/.exec(port);
        return match && Number(match[2]) === expectedPort;
      })
    )
      throw new Error(
        "DATABASE_URL must use the loopback port published by this project's PostgreSQL.",
      );
    const client = new Client({
      host: this.configuration.host,
      port: expectedPort,
      user: this.configuration.user,
      password: this.configuration.password,
      database: "postgres",
      connectionTimeoutMillis: 10000,
      application_name: "jev-local-db-snapshots",
    });
    client.on("error", () =>
      console.error("The PostgreSQL administration connection was interrupted."),
    );
    try {
      await client.connect();
      const lock = await client.query(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
        [`jev-trading:snapshots:${this.configuration.database}`],
      );
      if (!lock.rows[0].locked)
        throw new Error("Another backup or restore is already running for this database.");
      const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
        this.configuration.database,
      ]);
      if (!exists.rowCount) throw new Error("The configured local database does not exist.");
      return client;
    } catch (error) {
      await client.end();
      throw error;
    }
  }

  private postgres(args: string[], files: { input?: string; output?: string } = {}) {
    return run("docker", ["exec", "-i", this.container, ...args], {
      ...files,
      signal: this.signal,
    });
  }

  private async createBackup(label: string, updateLatest: boolean) {
    await this.prepareDirectory();
    this.signal?.throwIfAborted();
    const createdAt = new Date().toISOString();
    const timestamp = createdAt.replace(/[-:.]/g, "");
    const safeLabel = label.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 64) || "manual";
    const file = join(
      this.configuration.backupDirectory,
      `${this.configuration.database}_${timestamp}_${safeLabel}_${randomBytes(4).toString("hex")}.dump`,
    );
    const partial = `${file}.partial`;
    const pointer = `${this.latestFile}.${randomBytes(4).toString("hex")}.partial`;
    try {
      await this.postgres(
        [
          "pg_dump",
          "--host=/var/run/postgresql",
          `--username=${this.configuration.user}`,
          `--dbname=${this.configuration.database}`,
          "--format=custom",
          "--compress=6",
          "--no-owner",
          "--no-privileges",
        ],
        { output: partial },
      );
      await this.postgres(["pg_restore", "--list"], { input: partial });
      const git = (args: string[]) =>
        spawnSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).stdout?.trim() ?? "";
      const info = {
        version: 1,
        database: this.configuration.database,
        createdAt,
        label: safeLabel,
        gitBranch: git(["branch", "--show-current"]),
        gitCommit: git(["rev-parse", "HEAD"]),
        gitDirty: Boolean(git(["status", "--porcelain"])),
        sha256: await checksum(partial),
      };
      await writeFile(`${file}.info.json`, `${JSON.stringify(info, null, 2)}\n`, {
        mode: 0o600,
        flag: "wx",
      });
      await rename(partial, file);
      if (updateLatest) {
        await writeFile(pointer, `${basename(file)}\n`, { mode: 0o600, flag: "wx" });
        await rename(pointer, this.latestFile);
      }
      return file;
    } catch (error) {
      await Promise.all(
        [file, partial, `${file}.info.json`, pointer].map((path) => rm(path, { force: true })),
      );
      throw error;
    }
  }

  async backup(label = "manual") {
    const client = await this.connect();
    try {
      return await this.createBackup(label, true);
    } finally {
      await client.end();
    }
  }

  async verify(file: string) {
    let info;
    try {
      info = infoSchema.parse(JSON.parse(await readFile(`${file}.info.json`, "utf8")));
    } catch {
      throw new Error(
        "Snapshot metadata is missing or invalid. Keep the .dump and .info.json together.",
      );
    }
    if (info.database !== this.configuration.database)
      throw new Error(
        `This snapshot belongs to '${info.database}', not '${this.configuration.database}'.`,
      );
    if ((await checksum(file)) !== info.sha256)
      throw new Error("Snapshot checksum does not match. The database has not been changed.");
  }

  async restore(file: string) {
    await this.verify(file);
    const client = await this.connect();
    const suffix = randomBytes(8).toString("hex");
    const prefix = this.configuration.database.slice(0, 36);
    const temporary = identifier(`${prefix}_restore_${suffix}`);
    const previous = identifier(`${prefix}_previous_${suffix}`);
    const target = identifier(this.configuration.database);
    let temporaryCreated = false;
    let connectionsDisabled = false;
    let transaction = false;
    let swapped = false;
    try {
      await this.postgres(["pg_restore", "--list"], { input: file });
      await client.query(
        `CREATE DATABASE ${temporary} WITH OWNER ${identifier(this.configuration.user)} TEMPLATE template0`,
      );
      temporaryCreated = true;
      console.info("Restoring into a temporary database...");
      await this.postgres(
        [
          "pg_restore",
          "--host=/var/run/postgresql",
          `--username=${this.configuration.user}`,
          `--dbname=${temporary.slice(1, -1)}`,
          "--no-owner",
          "--no-privileges",
          "--exit-on-error",
          "--single-transaction",
        ],
        { input: file },
      );
      this.signal?.throwIfAborted();
      console.info("Creating a safety snapshot of the current database...");
      const safety = await this.createBackup("before-restore", false);
      console.info(`Safety snapshot: ${safety}`);
      this.signal?.throwIfAborted();
      await client.query(`ALTER DATABASE ${target} WITH ALLOW_CONNECTIONS false`);
      connectionsDisabled = true;
      await client.query(
        "SELECT pg_terminate_backend(pid, 10000) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [this.configuration.database],
      );
      // Both names change in one transaction, so a failed swap keeps the original name.
      await client.query("BEGIN");
      transaction = true;
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query(`ALTER DATABASE ${target} RENAME TO ${previous}`);
      await client.query(`ALTER DATABASE ${temporary} RENAME TO ${target}`);
      this.signal?.throwIfAborted();
      await client.query("COMMIT");
      transaction = false;
      connectionsDisabled = false;
      swapped = true;
      return safety;
    } finally {
      try {
        if (transaction) await client.query("ROLLBACK");
        if (connectionsDisabled)
          await client.query(`ALTER DATABASE ${target} WITH ALLOW_CONNECTIONS true`);
        if (temporaryCreated) {
          const discarded = swapped ? previous : temporary;
          await client.query(`DROP DATABASE ${discarded} WITH (FORCE)`).catch((error: Error) => {
            console.error(`Could not remove temporary database ${discarded}: ${error.message}`);
          });
        }
      } finally {
        await client.end();
      }
    }
  }
}
