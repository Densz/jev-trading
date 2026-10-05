import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
const directory = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(directory, "src"),
      "server-only": path.resolve(directory, "tests/server-only.ts"),
    },
  },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
