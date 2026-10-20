/**
 * Runs the staging <-> live content sync against two real databases: loads both, plans (plan.ts), and with
 * `apply` writes the plan. Rows are read and written as Postgres text, verbatim, so nothing is reformatted and a row
 * synced once fingerprints identically on both sides afterwards.
 *
 * Safety:
 *   - refuses to run when the two connection strings point at the same database, or the two schemas differ;
 *   - one transaction per database; an advisory lock stops two runs at once;
 *   - every row overwritten or deleted on either side is kept in the run's record (ContentSyncRun.backup);
 *   - questions and books are never deleted (tables.ts).
 */
import pg from 'pg';
import { problemsWithTestDatabase } from '@/lib/test-database-guard';
import { ledgerKey, parentsFirst, planSync, rowHash, summarise, type Decision, type Exclusions, type Plan, type Row, type Snapshot } from './plan';
import { PROMOTABLE_STATUSES, SEED_ONLY_TABLES, SYNC_TABLES } from './tables';

const LOCK_KEY = 482_913_771; // arbitrary, fixed: one sync at a time
const BATCH_ROWS = 100;

/** Every value as Postgres prints it: no Date, number or JSON parsing, so it can be written back unchanged. */
const RAW_TYPES = { getTypeParser: () => (value: string) => value } as unknown as pg.CustomTypesConfig;

export interface SyncOptions {
  stagingUrl: string;
  liveUrl: string;
  apply: boolean;
  /** Also copy admins' working records (ingestion runs etc.) down. Only for filling an empty staging database. */
  seed?: boolean;
  /** Copy down only: anything that would be promoted or deleted on the live database is held instead. */
  downOnly?: boolean;
  triggeredBy: string;
  exclusions: Exclusions;
}

export interface SyncReport {
  runId: string | null;
  applied: boolean;
  summary: ReturnType<typeof summarise>;
  /** Conflicts, blocked and held rows, for an admin to look at. */
  issues: Decision[];
  written: { live: number; staging: number; seeded: number };
}

function connect(url: string) {
  return new pg.Client({ connectionString: url, types: RAW_TYPES });
}

async function columnsOf(client: pg.Client, tables: string[]) {
  const { rows } = await client.query<{ table_name: string; column_name: string; udt_name: string }>(
    `select table_name, column_name, udt_name from information_schema.columns where table_schema = 'public' and table_name = any($1)`,
    [tables],
  );
  const out = new Map<string, string[]>();
  for (const r of rows) out.set(r.table_name, [...(out.get(r.table_name) ?? []), `${r.column_name}:${r.udt_name}`]);
  for (const [k, v] of out) out.set(k, v.sort());
  return out;
}

/** Differences between the two databases' columns for the synced tables. Empty when they match. */
export async function schemaDifferences(staging: pg.Client, live: pg.Client, tables: string[]): Promise<string[]> {
  const [s, l] = await Promise.all([columnsOf(staging, tables), columnsOf(live, tables)]);
  const problems: string[] = [];
  for (const table of tables) {
    const a = s.get(table);
    const b = l.get(table);
    if (!a) { problems.push(`${table} is missing in staging`); continue; }
    if (!b) { problems.push(`${table} is missing on the live database`); continue; }
    const onlyStaging = a.filter((c) => !b.includes(c));
    const onlyLive = b.filter((c) => !a.includes(c));
    if (onlyStaging.length || onlyLive.length) {
      problems.push(`${table}: ${[...onlyStaging.map((c) => `staging has ${c}`), ...onlyLive.map((c) => `live has ${c}`)].join(', ')}`);
    }
  }
  return problems;
}

async function loadSnapshot(client: pg.Client, tables: string[]): Promise<Snapshot> {
  const out: Snapshot = {};
  for (const table of tables) {
    const { rows } = await client.query<Row>(`select * from "${table}"`);
    out[table] = new Map(rows.map((r) => [r.id as string, r]));
  }
  return out;
}

async function upsert(client: pg.Client, table: string, rows: Row[]) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const quoted = columns.map((c) => `"${c}"`).join(', ');
  const updates = columns.filter((c) => c !== 'id').map((c) => `"${c}" = excluded."${c}"`).join(', ');
  for (let i = 0; i < rows.length; i += BATCH_ROWS) {
    const batch = rows.slice(i, i + BATCH_ROWS);
    const values: (string | null)[] = [];
    const tuples = batch.map((row) => `(${columns.map((c) => { values.push(row[c] ?? null); return `$${values.length}`; }).join(', ')})`);
    await client.query(`insert into "${table}" (${quoted}) values ${tuples.join(', ')} on conflict ("id") do update set ${updates}`, values);
  }
}

async function remove(client: pg.Client, table: string, ids: string[]) {
  if (ids.length) await client.query(`delete from "${table}" where "id" = any($1)`, [ids]);
}

/** Writes one direction of the plan: upserts parents first, deletes children first. Returns rows written. */
async function write(client: pg.Client, plan: Plan, source: Snapshot, upsertAction: 'promote' | 'replicate', deleteAction: 'delete-live' | 'delete-staging') {
  let written = 0;
  for (const table of SYNC_TABLES) {
    const ids = plan.decisions.filter((d) => d.table === table.name && d.action === upsertAction).map((d) => d.id);
    const rows = parentsFirst(ids.map((id) => source[table.name].get(id)!), table.selfParent);
    await upsert(client, table.name, rows);
    written += rows.length;
  }
  for (const table of [...SYNC_TABLES].reverse()) {
    const ids = plan.decisions.filter((d) => d.table === table.name && d.action === deleteAction).map((d) => d.id);
    await remove(client, table.name, ids);
    written += ids.length;
  }
  return written;
}

/** The rows a run is about to overwrite or delete on one side, kept so a run can be undone by hand. */
function backupOf(plan: Plan, target: Snapshot, actions: Decision['action'][]) {
  const out: Record<string, Row[]> = {};
  for (const d of plan.decisions) {
    if (!actions.includes(d.action)) continue;
    const row = target[d.table]?.get(d.id);
    if (row) (out[d.table] ??= []).push(row);
  }
  return out;
}

async function updateLedger(staging: pg.Client, plan: Plan) {
  const set: Array<[string, string, string]> = [];
  const drop: Array<[string, string]> = [];
  for (const d of plan.decisions) {
    const key = ledgerKey(d.table, d.id);
    if (d.action === 'in-sync' || d.action === 'promote') set.push([d.table, d.id, plan.stagingHashes.get(key)!]);
    else if (d.action === 'replicate') set.push([d.table, d.id, plan.liveHashes.get(key)!]);
    else if (d.action === 'delete-live' || d.action === 'delete-staging' || d.action === 'forget' || d.action === 'excluded') drop.push([d.table, d.id]);
  }
  for (let i = 0; i < set.length; i += 500) {
    const batch = set.slice(i, i + 500);
    const values: string[] = [];
    const tuples = batch.map(([t, id, h]) => { values.push(t, id, h); return `($${values.length - 2}, $${values.length - 1}, $${values.length}, now())`; });
    await staging.query(
      `insert into "ContentSyncLedger" ("tableName", "rowId", "hash", "syncedAt") values ${tuples.join(', ')}
       on conflict ("tableName", "rowId") do update set "hash" = excluded."hash", "syncedAt" = excluded."syncedAt"`,
      values,
    );
  }
  for (let i = 0; i < drop.length; i += 500) {
    const batch = drop.slice(i, i + 500);
    await staging.query(`delete from "ContentSyncLedger" where ("tableName", "rowId") in (select * from unnest($1::text[], $2::text[]))`, [batch.map((b) => b[0]), batch.map((b) => b[1])]);
  }
}

/** Copies admins' working records down for rows staging does not have, where their parents are present. */
async function seedOperational(staging: pg.Client, live: pg.Client, exclusions: Exclusions) {
  let seeded = 0;
  for (const table of SEED_ONLY_TABLES) {
    const [{ rows: liveRows }, { rows: have }] = await Promise.all([
      live.query<Row>(`select * from "${table.name}"`),
      staging.query<{ id: string }>(`select "id" from "${table.name}"`),
    ]);
    const present = new Set(have.map((r) => r.id));
    const wanted: Row[] = [];
    for (const row of liveRows) {
      if (present.has(row.id as string) || (row.id as string).startsWith(exclusions.idPrefix)) continue;
      let parentsThere = true;
      for (const fk of table.foreignKeys) {
        const parentId = row[fk.column];
        if (parentId == null) continue;
        const { rowCount } = await staging.query(`select 1 from "${fk.table}" where "id" = $1`, [parentId]);
        if (!rowCount) { parentsThere = false; break; }
      }
      if (parentsThere) wanted.push(row);
    }
    await upsert(staging, table.name, wanted);
    seeded += wanted.length;
  }
  return seeded;
}

export async function runContentSync(options: SyncOptions): Promise<SyncReport> {
  const problems = problemsWithTestDatabase(options.stagingUrl, options.liveUrl);
  if (problems.length) throw new Error(`Content sync refused: ${problems.join(' ')}`);

  const staging = connect(options.stagingUrl);
  const live = connect(options.liveUrl);
  await Promise.all([staging.connect(), live.connect()]);
  let runId: string | null = null;
  try {
    const { rows: [{ locked }] } = await staging.query<{ locked: string }>('select pg_try_advisory_lock($1) as locked', [LOCK_KEY]);
    if (locked !== 't') throw new Error('Another content sync is running. Try again when it has finished.');

    const tableNames = [...SYNC_TABLES.map((t) => t.name), ...(options.seed ? SEED_ONLY_TABLES.map((t) => t.name) : [])];
    const differences = await schemaDifferences(staging, live, tableNames);
    if (differences.length) throw new Error(`The two databases' schemas differ; apply the same migrations to both first:\n  ${differences.join('\n  ')}`);

    const { rows: [run] } = await staging.query<{ id: string }>(
      `insert into "ContentSyncRun" ("id", "mode", "triggeredBy", "status") values (gen_random_uuid()::text, $1, $2, 'RUNNING') returning "id"`,
      [options.apply ? 'APPLY' : 'DRY_RUN', options.triggeredBy],
    );
    runId = run.id;

    const syncTables = SYNC_TABLES.map((t) => t.name);
    const [stagingSnap, liveSnap, ledgerRows] = await Promise.all([
      loadSnapshot(staging, syncTables),
      loadSnapshot(live, syncTables),
      staging.query<{ tableName: string; rowId: string; hash: string }>('select "tableName", "rowId", "hash" from "ContentSyncLedger"'),
    ]);
    const ledger = new Map(ledgerRows.rows.map((r) => [ledgerKey(r.tableName, r.rowId), r.hash]));
    const plan = planSync({ staging: stagingSnap, live: liveSnap, ledger, exclusions: options.exclusions });
    if (options.downOnly) {
      for (const d of plan.decisions) {
        if (d.action === 'promote' || d.action === 'delete-live') Object.assign(d, { action: 'held', reason: 'this run only copies down from the live site' });
      }
    }
    const summary = summarise(plan);
    const issues = plan.decisions.filter((d) => d.action === 'conflict' || d.action === 'blocked' || d.action === 'held');
    const written = { live: 0, staging: 0, seeded: 0 };

    let backup: Record<string, unknown> | null = null;
    if (options.apply) {
      backup = {
        live: backupOf(plan, liveSnap, ['promote', 'delete-live']),
        staging: backupOf(plan, stagingSnap, ['replicate', 'delete-staging']),
      };
      await live.query('begin');
      try {
        written.live = await write(live, plan, stagingSnap, 'promote', 'delete-live');
        await live.query('commit');
      } catch (error) {
        await live.query('rollback');
        throw error;
      }
      await staging.query('begin');
      try {
        written.staging = await write(staging, plan, liveSnap, 'replicate', 'delete-staging');
        if (options.seed) written.seeded = await seedOperational(staging, live, options.exclusions);
        await updateLedger(staging, plan);
        await staging.query('commit');
      } catch (error) {
        await staging.query('rollback');
        throw error;
      }
    }

    await staging.query(
      `update "ContentSyncRun" set "status" = 'DONE', "finishedAt" = now(), "summary" = $2, "issues" = $3, "backup" = $4 where "id" = $1`,
      [runId, JSON.stringify({ tables: summary, written }), JSON.stringify(issues), backup ? JSON.stringify(backup) : null],
    );
    return { runId, applied: options.apply, summary, issues, written };
  } catch (error) {
    if (runId) {
      await staging.query(`update "ContentSyncRun" set "status" = 'FAILED', "finishedAt" = now(), "error" = $2 where "id" = $1`, [runId, (error as Error).message]).catch(() => {});
    }
    throw error;
  } finally {
    await staging.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    await Promise.all([staging.end(), live.end()]);
  }
}

export interface ResolveOptions {
  stagingUrl: string;
  liveUrl: string;
  table: string;
  id: string;
  /** Which side's version wins: it is copied over the other side's. */
  keep: 'staging' | 'live';
  triggeredBy: string;
}

/**
 * Settles one conflict by copying the chosen side's row over the other's. The row overwritten is kept in a run
 * record (mode RESOLVE). Only rows of synced tables, and only an approved/archived question or revision item can be
 * pushed to live this way; the live site's own accounts and folders always win.
 */
export async function resolveConflict(options: ResolveOptions): Promise<{ runId: string }> {
  const problems = problemsWithTestDatabase(options.stagingUrl, options.liveUrl);
  if (problems.length) throw new Error(`Content sync refused: ${problems.join(' ')}`);
  const table = SYNC_TABLES.find((t) => t.name === options.table);
  if (!table) throw new Error(`${options.table} is not synced`);
  if (options.keep === 'staging' && table.direction === 'down') throw new Error(`${table.name} is managed on the live site; keep the live version`);

  const staging = connect(options.stagingUrl);
  const live = connect(options.liveUrl);
  await Promise.all([staging.connect(), live.connect()]);
  try {
    const { rows: [{ locked }] } = await staging.query<{ locked: string }>('select pg_try_advisory_lock($1) as locked', [LOCK_KEY]);
    if (locked !== 't') throw new Error('A content sync is running. Try again when it has finished.');
    const differences = await schemaDifferences(staging, live, [table.name]);
    if (differences.length) throw new Error(`The two databases' schemas differ: ${differences.join('; ')}`);

    const read = async (client: pg.Client) => (await client.query<Row>(`select * from "${table.name}" where "id" = $1`, [options.id])).rows[0];
    const [stagingRow, liveRow] = await Promise.all([read(staging), read(live)]);
    const winner = options.keep === 'staging' ? stagingRow : liveRow;
    const loser = options.keep === 'staging' ? liveRow : stagingRow;
    if (!winner) throw new Error(`There is no ${options.keep} version of ${table.name} ${options.id} to keep`);
    if (options.keep === 'staging' && table.gate === 'status' && !PROMOTABLE_STATUSES.has(winner.status ?? '')) {
      throw new Error(`Approve or archive it in staging first: its status is ${winner.status}`);
    }

    const target = options.keep === 'staging' ? live : staging;
    await target.query('begin');
    try {
      await upsert(target, table.name, [winner]);
      await target.query('commit');
    } catch (error) {
      await target.query('rollback');
      throw new Error(`Could not copy it: ${(error as Error).message}. Its book, chapter or author may need to go across first.`);
    }
    await staging.query(
      `insert into "ContentSyncLedger" ("tableName", "rowId", "hash", "syncedAt") values ($1, $2, $3, now())
       on conflict ("tableName", "rowId") do update set "hash" = excluded."hash", "syncedAt" = now()`,
      [table.name, options.id, rowHash(winner)],
    );
    const { rows: [run] } = await staging.query<{ id: string }>(
      `insert into "ContentSyncRun" ("id", "mode", "triggeredBy", "status", "finishedAt", "summary", "backup")
       values (gen_random_uuid()::text, 'RESOLVE', $1, 'DONE', now(), $2, $3) returning "id"`,
      [options.triggeredBy, JSON.stringify({ table: table.name, id: options.id, kept: options.keep }), JSON.stringify({ [options.keep === 'staging' ? 'live' : 'staging']: { [table.name]: loser ? [loser] : [] } })],
    );
    return { runId: run.id };
  } finally {
    await staging.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    await Promise.all([staging.end(), live.end()]);
  }
}
