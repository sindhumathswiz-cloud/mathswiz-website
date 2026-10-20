/**
 * The staging database: where admins import, extract, correct and approve questions before they go live.
 *
 *   npm run staging:setup              one-time: creates the tables in the staging database and copies the
 *                                      content down from live (down only: never writes to the live database)
 *   npm run staging:push               after a schema change: brings the staging tables up to date
 *   npm run content:sync               preview: what would be promoted, replicated, held or in conflict
 *   npm run content:sync -- --apply    do it
 *   npm run content:sync:status        the last few runs
 *   scripts/content-sync-scheduled.cmd   what the every-six-hours scheduled task runs (publishes; logs to logs/)
 *
 * Connection strings: STAGING_DATABASE_URL in frontend/.env.staging; live is DATABASE_URL in .env.local
 * (or LIVE_DATABASE_URL). Refuses to run when they are the same database.
 */
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { readDatabaseUrls } from '../e2e/test-database';
import { problemsWithTestDatabase } from '../src/lib/test-database-guard';
import { E2E_EXCLUSIONS } from '../src/lib/content-sync/exclusions';
import { runContentSync, type SyncReport } from '../src/lib/content-sync/run';

const [command, ...flags] = process.argv.slice(2);
const APPLY = flags.includes('--apply');
// Who started the run, for the run record: --by=schedule from the scheduled task, otherwise the command line.
const BY = flags.find((f) => f.startsWith('--by='))?.slice('--by='.length) || 'cli';

function urls() {
  const { stagingUrl, liveUrl } = readDatabaseUrls();
  const problems = problemsWithTestDatabase(stagingUrl, liveUrl);
  if (problems.length) {
    console.error(`Staging database not usable:\n  - ${problems.join('\n  - ')}\nPut STAGING_DATABASE_URL=postgresql://... in frontend/.env.staging.`);
    process.exit(1);
  }
  if (!liveUrl) {
    console.error('The live database is unknown: DATABASE_URL is missing from .env.local.');
    process.exit(1);
  }
  return { stagingUrl: stagingUrl!, liveUrl };
}

async function pushSchema(stagingUrl: string) {
  // The schema uses pgvector; the extension must exist before the tables.
  const client = new pg.Client({ connectionString: stagingUrl });
  await client.connect();
  try { await client.query('create extension if not exists vector'); } finally { await client.end(); }
  // prisma.config.ts reads DATABASE_URL from the environment; point it at staging for this one command.
  const result = spawnSync('npx', ['prisma', 'db', 'push'], { stdio: 'inherit', shell: true, env: { ...process.env, DATABASE_URL: stagingUrl } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function print(report: SyncReport) {
  console.log(report.applied ? '\nApplied.' : '\nPreview only (nothing written). Add --apply to do it.');
  const rows = Object.entries(report.summary).map(([table, counts]) => `  ${table.padEnd(20)} ${Object.entries(counts).map(([a, n]) => `${a} ${n}`).join(', ')}`);
  console.log(rows.join('\n'));
  if (report.applied) console.log(`written: live ${report.written.live}, staging ${report.written.staging}${report.written.seeded ? `, working records ${report.written.seeded}` : ''}`);
  for (const kind of ['conflict', 'blocked', 'held']) {
    const list = report.issues.filter((d) => d.action === kind);
    if (!list.length) continue;
    console.log(`\n${kind} (${list.length}):`);
    for (const d of list.slice(0, 15)) console.log(`  ${d.table} ${d.id}: ${d.reason ?? ''}`);
    if (list.length > 15) console.log(`  ... and ${list.length - 15} more (see the run record ${report.runId})`);
  }
}

async function main() {
  if (command === 'setup' || command === 'push') {
    const { stagingUrl, liveUrl } = urls();
    await pushSchema(stagingUrl);
    if (command === 'push') return;
    console.log('\nCopying content down from the live database (nothing is written to live)...');
    print(await runContentSync({ stagingUrl, liveUrl, apply: true, seed: true, downOnly: true, triggeredBy: 'setup', exclusions: E2E_EXCLUSIONS }));
    return;
  }
  if (command === 'sync') {
    const { stagingUrl, liveUrl } = urls();
    print(await runContentSync({ stagingUrl, liveUrl, apply: APPLY, triggeredBy: BY, exclusions: E2E_EXCLUSIONS }));
    return;
  }
  if (command === 'status') {
    const { stagingUrl } = urls();
    const client = new pg.Client({ connectionString: stagingUrl });
    await client.connect();
    try {
      const { rows } = await client.query('select "startedAt", "mode", "triggeredBy", "status", "summary"->\'written\' as written, "error" from "ContentSyncRun" order by "startedAt" desc limit 10');
      for (const r of rows) console.log(`${new Date(r.startedAt).toLocaleString('en-IN')}  ${r.mode.padEnd(7)} ${r.status.padEnd(7)} by ${r.triggeredBy}  ${r.written ? JSON.stringify(r.written) : ''} ${r.error ?? ''}`);
      if (!rows.length) console.log('No sync has run yet.');
    } finally { await client.end(); }
    return;
  }
  console.error('Usage: npm run staging:setup | staging:push | content:sync [-- --apply] | content:sync:status');
  process.exit(1);
}

main().catch((error) => { console.error((error as Error).message); process.exit(1); });
