/** Read-only: compares the live and staging columns for every table the content sync covers. */
import pg from 'pg';
import { readDatabaseUrls } from '../e2e/test-database';
import { schemaDifferences } from '../src/lib/content-sync/run';
import { SEED_ONLY_TABLES, SYNC_TABLES } from '../src/lib/content-sync/tables';

(async () => {
  const { stagingUrl, liveUrl } = readDatabaseUrls();
  const staging = new pg.Client({ connectionString: stagingUrl });
  const live = new pg.Client({ connectionString: liveUrl });
  await Promise.all([staging.connect(), live.connect()]);
  try {
    const tables = [...SYNC_TABLES, ...SEED_ONLY_TABLES].map((t) => t.name);
    const problems = await schemaDifferences(staging, live, tables);
    console.log(problems.length ? `Differences:\n  ${problems.join('\n  ')}` : `The ${tables.length} synced tables match exactly.`);
  } finally {
    await Promise.all([staging.end(), live.end()]);
  }
})().catch((error) => { console.error(error); process.exit(1); });
