/**
 * Read-only: how many rows and how much space each table takes in the database named by DATABASE_URL (.env.local),
 * split into content (what the staging database needs) and everything else. Changes nothing.
 *
 *   npx tsx scripts/content-size-report.ts
 */
import { config } from 'dotenv';
import pg from 'pg';

config({ path: '.env.local', quiet: true });

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ table: string; rows: string; bytes: string }>(`
      select c.relname as table, c.reltuples::bigint as rows, pg_total_relation_size(c.oid) as bytes
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by pg_total_relation_size(c.oid) desc`);
    const total = await client.query<{ bytes: string }>('select pg_database_size(current_database()) as bytes');
    const mb = (b: string | number) => `${(Number(b) / 1024 / 1024).toFixed(1)} MB`;
    console.log(`database total: ${mb(total.rows[0].bytes)}`);
    for (const r of rows) console.log(`${r.table.padEnd(28)} ${String(Math.max(0, Number(r.rows))).padStart(9)} rows  ${mb(r.bytes).padStart(10)}`);
    const ext = await client.query<{ extname: string }>('select extname from pg_extension order by 1');
    console.log('extensions:', ext.rows.map((r) => r.extname).join(', '));
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
