import { describe, expect, it } from "vitest";
import { localDatabaseConfiguration } from "../scripts/local-database";

describe("local database snapshot targets", () => {
  it("defaults to the Compose database and accepts a separate local test database", () => {
    expect(localDatabaseConfiguration({})).toMatchObject({
      database: "jev",
      user: "jev",
      host: "127.0.0.1",
      port: 5434,
    });
    expect(
      localDatabaseConfiguration({
        DATABASE_URL: "postgresql://jev:fixture@localhost:5434/jev_snapshots_test?schema=public",
      }),
    ).toMatchObject({ database: "jev_snapshots_test", host: "localhost", port: 5434 });
  });

  it("rejects remote servers, system databases and unsafe SQL identifiers without echoing credentials", () => {
    for (const url of [
      "postgresql://jev:private-fixture@production.example:5432/jev",
      "https://jev:private-fixture@localhost:5434/jev",
      "postgresql://jev:private-fixture@127.0.0.1:5434/postgres",
      "postgresql://jev:private-fixture@127.0.0.1:5434/template0",
      "postgresql://jev:private-fixture@127.0.0.1:5434/template1",
      "postgresql://jev:private-fixture@127.0.0.1:5434/jev%22%3B",
      "postgresql://jev%22:private-fixture@127.0.0.1:5434/jev",
      "invalid-private-fixture",
    ]) {
      expect(() => localDatabaseConfiguration({ DATABASE_URL: url })).toThrow();
      try {
        localDatabaseConfiguration({ DATABASE_URL: url });
      } catch (error) {
        expect(String(error)).not.toContain("private-fixture");
      }
    }
  });
});
