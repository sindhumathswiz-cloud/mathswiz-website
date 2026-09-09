import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const REQUIRED_TABLES = ["User", "AuditLog", "_prisma_migrations"];

async function checkDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const tables = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = $1 and table_name = any($2)",
      ["public", REQUIRED_TABLES],
    );
    const found = new Set(tables.rows.map((row) => row.table_name));
    const missing = REQUIRED_TABLES.filter((table) => !found.has(table));
    if (missing.length) throw new Error(`Missing critical tables: ${missing.join(", ")}`);

    const migrations = await client.query<{ migration_name: string; finished_at: Date | null }>(
      'select migration_name, finished_at from "_prisma_migrations" order by started_at desc limit 1',
    );
    if (!migrations.rows[0]?.finished_at) throw new Error("No completed Prisma migration was found");
    console.log(`database=ok latest_migration=${migrations.rows[0].migration_name}`);
  } finally {
    await client.end();
  }
}

async function checkSupabaseBackups() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  if (!token || !projectRef) {
    console.log("backup_inventory=manual_check_required");
    return;
  }

  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/backups`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Supabase backup inventory returned ${response.status}`);
  console.log("backup_inventory=reachable");
}

async function main() {
  await checkDatabase();
  await checkSupabaseBackups();
  console.log("recovery_readiness=passed");
}

main().catch((error) => {
  console.error(`recovery_readiness=failed reason=${error instanceof Error ? error.message : "unknown"}`);
  process.exitCode = 1;
});
