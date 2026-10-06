import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { LocalDatabase, localDatabaseConfiguration } from "./local-database";

const help = `Local PostgreSQL snapshots for this project's Docker Compose database.

Usage:
  pnpm db:backup [label]
  pnpm db:backups
  pnpm db:restore [latest|backup-file] [--yes]

A restore prepares a temporary database and creates a safety snapshot before
replacing the current database. Schema, data and Prisma migration history are
restored together. Stop the app and scheduler before restoring.
DATABASE_URL must point to the local Compose database.
JEV_DB_BACKUP_DIR defaults to .db-backups/.
`;

const cancellation = new AbortController();
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const interrupt = () => cancellation.abort(new Error("Database snapshot command interrupted."));
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

async function main() {
  const [command, ...rawArgs] = process.argv.slice(2);
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  if (args.includes("--help") || args.includes("-h")) {
    console.info(help);
    return;
  }
  const database = new LocalDatabase(localDatabaseConfiguration(), cancellation.signal);
  if (command === "backup") {
    if (args.length > 1 || args.some((arg) => arg.startsWith("-")))
      throw new Error("Usage: pnpm db:backup [label]");
    const file = await database.backup(args[0]);
    console.info(`Backup created: ${file}`);
    console.info(`Restore with: pnpm db:restore ${shellQuote(file)}`);
    return;
  }
  if (command === "backups") {
    if (args.length) throw new Error("Usage: pnpm db:backups");
    await database.list();
    return;
  }
  if (command !== "restore") throw new Error(help);
  const yes = args.includes("--yes") || args.includes("-y");
  const paths = args.filter((arg) => arg !== "--yes" && arg !== "-y");
  if (paths.length > 1 || paths.some((arg) => arg.startsWith("-")))
    throw new Error("Usage: pnpm db:restore [latest|backup-file] [--yes]");
  const file = await database.resolveBackup(paths[0]);
  await database.verify(file);
  if (!yes) {
    if (!process.stdin.isTTY)
      throw new Error(
        "Restore requires an interactive terminal. Pass --yes for intentional non-interactive use.",
      );
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const name = database.configuration.database;
      const answer = await prompt.question(
        `Replace local database '${name}' with ${file}?\nType '${name}' to continue: `,
        { signal: cancellation.signal },
      );
      if (answer !== name) throw new Error("Restore cancelled.");
    } finally {
      prompt.close();
    }
  }
  const safety = await database.restore(file);
  console.info(`Restore complete for ${database.configuration.database}.`);
  console.info(`Undo this restore with: pnpm db:restore ${shellQuote(safety)}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Database snapshot command failed.");
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
}
