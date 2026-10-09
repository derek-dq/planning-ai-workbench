import { spawnSync } from "node:child_process";
import path from "node:path";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const [testFile, flag] = process.argv.slice(2);
if (!testFile || !flag || !testFile.endsWith(".live.test.ts")) {
  throw new Error("Usage: node scripts/run-live-smoke.mjs <live-test-file> <LIVE_SMOKE_FLAG>");
}

const { combinedEnv } = loadEnvConfig(process.cwd(), true, undefined, true);
const result = spawnSync(
  process.execPath,
  [path.join(process.cwd(), "node_modules", "vitest", "vitest.mjs"), "run", testFile],
  {
    cwd: process.cwd(),
    env: { ...process.env, ...combinedEnv, [flag]: "1" },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
