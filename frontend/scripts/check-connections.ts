/** Read-only: opens a fresh connection to the live and staging databases and reports what is there. Prints no secrets. */
import pg from 'pg';
import { readDatabaseUrls } from '../e2e/test-database';

async function probe(label: string, url: string | undefined) {
  if (!url) return console.log(`${label}: no connection string`);
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    const { rows: [t] } = await client.query(`select count(*)::int as tables from information_schema.tables where table_schema = 'public'`);
    const { rows: ext } = await client.query(`select extname from pg_extension where extname = 'vector'`);
    let questions = 'n/a';
    try { questions = String((await client.query('select count(*)::int as n from "Question"')).rows[0].n); } catch { /* no table yet */ }
    console.log(`${label}: connected. public tables ${t.tables}, Question rows ${questions}, vector extension ${ext.length ? 'yes' : 'no'}`);
  } catch (error) {
    console.log(`${label}: FAILED to connect: ${(error as Error).message}`);
  } finally {
    await client.end().catch(() => {});
  }
}

const { stagingUrl, liveUrl } = readDatabaseUrls();
(async () => {
  await probe('live   ', liveUrl);
  await probe('staging', stagingUrl);
})();
