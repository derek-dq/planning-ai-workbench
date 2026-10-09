import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const liveSmokeEnabled = process.env.PLANNER_LIVE_SMOKE === "1"
  || process.env.WRITER_LIVE_SMOKE === "1"
  || process.env.REVIEWER_LIVE_SMOKE === "1"
  || process.env.CASE_001_PLANNER_LIVE_EVAL === "1";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    watch: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    teardownTimeout: 5_000,
    exclude: liveSmokeEnabled
      ? ["**/node_modules/**"]
      : ["**/node_modules/**", "**/*.live.test.ts"],
  },
});
