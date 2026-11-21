import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@content": path.resolve(import.meta.dirname, "content"),
      // `server-only` throws outside React's server environment; tests run in plain Node
      "server-only": path.resolve(import.meta.dirname, "src/test/empty.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
