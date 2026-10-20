/**
 * Creates or updates the tables in the staging database (STAGING_DATABASE_URL in .env.staging), which the e2e suite
 * also runs against.
 *
 *   npm run e2e:db:push
 *
 * Uses `prisma db push`, which builds the schema straight from prisma/schema.prisma. That is right for a throwaway
 * test database; it is never run against the real one: applyTestEnvironment() refuses a missing or identical URL.
 */
import { spawnSync } from "node:child_process";
import pg from "pg";
import { applyTestEnvironment } from "../e2e/test-database";

const command = process.argv[2];
if (command !== "push") {
  console.error("Usage: npm run e2e:db:push");
  process.exit(1);
}

try {
  applyTestEnvironment();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

async function main() {
  // The schema uses pgvector; the extension must exist before the tables are created.
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try { await client.query("create extension if not exists vector"); } finally { await client.end(); }

  // prisma.config.ts reads DATABASE_URL from the environment, which now holds the staging database.
  const result = spawnSync("npx", ["prisma", "db", "push"], { stdio: "inherit", shell: true, env: process.env });
  process.exit(result.status ?? 1);
}

main().catch((error) => { console.error((error as Error).message); process.exit(1); });
