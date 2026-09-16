import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // One worker: several specs below share one teacher/student fixture
  // account and mutate the same rows (creating/publishing/assigning
  // tests, creating interventions) -- serial execution avoids both
  // cross-test data races and overloading the Next.js dev server's
  // on-demand route compilation with concurrent first-hits.
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["line"]] : "line",
  // Seeds/resets the teacher, student, batch, and fixture question-bank
  // data every spec below relies on (see e2e/fixtures/seed.ts).
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  // Next.js dev mode compiles each route on its first hit, which can take
  // several seconds -- padded above Playwright's 5s default so that isn't
  // mistaken for a real assertion failure.
  expect: { timeout: 10_000 },
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000/api/health/live",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    // Logs in as the fixture teacher/student once via the real UI and
    // saves each session's storageState -- every other project depends on
    // this so specs start already authenticated instead of re-logging in.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
  ],
});
