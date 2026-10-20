import { defineConfig, devices } from "@playwright/test";
import { applyTestEnvironment, E2E_BASE_URL, E2E_DIST_DIR, E2E_PORT } from "./e2e/test-database";

// The suite wipes and recreates data on every run: it runs against its own database (see e2e/README.md), on its
// own port and build folder, and stops here with instructions if that database is missing or looks like the real one.
applyTestEnvironment();

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
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
  },
  // Next.js dev mode compiles each route on its first hit, which can take
  // several seconds -- padded above Playwright's 5s default so that isn't
  // mistaken for a real assertion failure.
  expect: { timeout: 10_000 },
  webServer: {
    command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/api/health/live`,
    // Never reuse a server that is already running: a dev server on port 3000 is connected to the real database.
    reuseExistingServer: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      NEXTAUTH_URL: E2E_BASE_URL,
      NEXT_DIST_DIR: E2E_DIST_DIR,
      // The suite runs on the staging database, where importing books is allowed (lib/content-role).
      CONTENT_ROLE: "staging",
      PORT: String(E2E_PORT),
    },
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
