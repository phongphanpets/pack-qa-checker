import { defineConfig, devices } from "@playwright/test";

const node = JSON.stringify(process.execPath);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `${node} ./node_modules/vinext/dist/cli.js start --port 3100`,
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 30_000,
    env: { PLAYWRIGHT_LOCAL_E2E: "1" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
