import { defineConfig } from "@playwright/test";

// End-to-end check of one full heist. Needs the web app and the worker running;
// without a Claude key the academy plays offline Milo, see README.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    channel: process.env.E2E_CHANNEL ?? "chrome",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
});
