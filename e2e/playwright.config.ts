import { defineConfig, devices } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_ADMIN_URL, E2E_API_URL, E2E_USER_URL } from "./helpers/env.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "../test-results/playwright",
  use: {
    ...devices["Desktop Chrome"],
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node scripts/run_with_env.mjs BJC_API_PORT=3011 -- node dist/src/server.js",
      cwd: rootDir,
      url: `${E2E_API_URL}/ready`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "npm --prefix web run preview -- --host 127.0.0.1 --port 4191",
      cwd: rootDir,
      url: E2E_ADMIN_URL,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "npm --prefix web-user run preview -- --host 127.0.0.1 --port 4192",
      cwd: rootDir,
      url: E2E_USER_URL,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
