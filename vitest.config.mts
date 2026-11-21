import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@content": path.resolve(__dirname, "content"),
      // `server-only` throws outside React's server environment; tests run in plain Node
      "server-only": path.resolve(__dirname, "src/test/empty.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
