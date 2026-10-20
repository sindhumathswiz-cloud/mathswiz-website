/**
 * Points the whole e2e run (the web server it starts, the seed, the database helpers) at the STAGING database, never
 * the live one. The suite wipes and recreates its fixtures on every run; its rows are recognised and never promoted
 * to the live site by the content sync (src/lib/content-sync). See e2e/README.md for the one-time setup.
 *
 * Call applyTestEnvironment() before anything reads DATABASE_URL. It is safe to call more than once.
 */
import { parse } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { problemsWithTestDatabase } from "../src/lib/test-database-guard";

/** The e2e web server runs on its own port and build folder so it can never reuse a dev server that is on live data. */
export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;
export const E2E_DIST_DIR = ".next-e2e";

function readEnvFile(file: string): Record<string, string> {
  const full = path.resolve(process.cwd(), file);
  return existsSync(full) ? parse(readFileSync(full)) : {};
}

/**
 * The staging and live connection strings. Staging comes from STAGING_DATABASE_URL (environment, or
 * frontend/.env.staging); the older E2E_DATABASE_URL / .env.e2e names are still accepted. Live is DATABASE_URL in
 * .env.local unless LIVE_DATABASE_URL says otherwise (as on the staging deployment, where DATABASE_URL is staging).
 */
export function readDatabaseUrls(): { stagingUrl: string | undefined; liveUrl: string | undefined } {
  const stagingEnv = readEnvFile(".env.staging");
  const legacyEnv = readEnvFile(".env.e2e");
  const localEnv = readEnvFile(".env.local");
  return {
    stagingUrl: process.env.STAGING_DATABASE_URL || stagingEnv.STAGING_DATABASE_URL || process.env.E2E_DATABASE_URL || legacyEnv.E2E_DATABASE_URL,
    liveUrl: process.env.LIVE_DATABASE_URL || stagingEnv.LIVE_DATABASE_URL || localEnv.DATABASE_URL,
  };
}

let applied = false;

export function applyTestEnvironment(): void {
  if (applied && process.env.E2E_ISOLATED_DATABASE === "1") return;

  const { stagingUrl, liveUrl } = readDatabaseUrls();
  const problems = problemsWithTestDatabase(stagingUrl, liveUrl);
  if (problems.length > 0) {
    throw new Error(
      [
        "The e2e suite will not run against this database:",
        ...problems.map((p) => `  - ${p}`),
        "",
        "It wipes and recreates its fixtures on every run, so it runs on the staging database. One-time setup:",
        "  1. Create a second, empty Postgres database (for example a second free Supabase project).",
        "  2. Put its connection string in frontend/.env.staging as:  STAGING_DATABASE_URL=postgresql://...",
        "  3. Create its tables:  npm run e2e:db:push",
        "See e2e/README.md.",
      ].join("\n"),
    );
  }

  // Everything started from here (Playwright's workers, the dev server it launches) inherits these.
  process.env.DATABASE_URL = stagingUrl;
  process.env.E2E_ISOLATED_DATABASE = "1";
  process.env.E2E_BASE_URL = E2E_BASE_URL;
  applied = true;
}

/** The seed and the helpers call this so they can never run against the live database by accident. */
export function assertIsolatedTestDatabase(): void {
  if (process.env.E2E_ISOLATED_DATABASE !== "1") {
    throw new Error("Refusing to run: the staging database has not been selected. Call applyTestEnvironment() first.");
  }
}
