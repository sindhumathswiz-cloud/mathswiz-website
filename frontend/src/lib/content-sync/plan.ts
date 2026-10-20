/**
 * Decides, row by row, what the staging <-> live content sync should do. Pure: it is given both databases' rows
 * (as Postgres text, exactly as stored) and the fingerprints recorded at the last sync, and returns decisions.
 *
 * For each row the three fingerprints (staging now, live now, last sync) say which side changed:
 *   - same on both sides                  -> in sync
 *   - only staging changed (or is new)    -> promote to live, if approved (see the gates in tables.ts)
 *   - only live changed (or is new)       -> replicate down to staging
 *   - both changed since the last sync    -> conflict: neither side is overwritten, an admin decides
 * A row is only written where its parents (foreign keys) will exist, so a promoted question takes its book,
 * chapter and source document with it, and a question whose author is not on the live site is blocked, not broken.
 * E2E rows (the test suite's accounts and everything they own) are never synced in either direction.
 */
import { createHash } from 'node:crypto';
import { PROMOTABLE_STATUSES, STAFF_ROLES, SYNC_TABLES, type SyncTable } from './tables';

export type Row = Record<string, string | null>;
export type Snapshot = Record<string, Map<string, Row>>;

export type Action =
  | 'in-sync'
  | 'promote'
  | 'replicate'
  | 'delete-live'
  | 'delete-staging'
  | 'conflict'
  | 'held'
  | 'blocked'
  | 'kept'
  | 'excluded'
  | 'forget';

export interface Decision {
  table: string;
  id: string;
  action: Action;
  reason?: string;
}

export interface Exclusions {
  /** Mobile numbers of the e2e accounts. */
  userMobiles: string[];
  /** Fixed ids the e2e fixtures use, e.g. "e2e-". */
  idPrefix: string;
  /** A tag the e2e suite puts on questions it creates. */
  questionTag: string;
  /** Title prefix of books the e2e suite creates. */
  bookTitlePrefix: string;
}

export interface PlanInput {
  staging: Snapshot;
  live: Snapshot;
  /** Fingerprint at the last sync, keyed "Table:id". */
  ledger: Map<string, string>;
  exclusions: Exclusions;
  tables?: SyncTable[];
}

export interface Plan {
  decisions: Decision[];
  /** Fingerprints of the rows on each side, keyed "Table:id". */
  stagingHashes: Map<string, string>;
  liveHashes: Map<string, string>;
}

export const ledgerKey = (table: string, id: string) => `${table}:${id}`;

/** Fingerprint of a row: every column, in name order, as stored. */
export function rowHash(row: Row): string {
  const ordered = Object.keys(row).sort().map((key) => [key, row[key]]);
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}

/** Rows that belong to the e2e suite: its accounts, fixed-id fixtures, tagged questions and books, and their children. */
export function excludedRows(snapshots: Snapshot[], exclusions: Exclusions, tables: SyncTable[] = SYNC_TABLES): Map<string, Set<string>> {
  const excluded = new Map<string, Set<string>>();
  for (const table of tables) {
    const set = new Set<string>();
    excluded.set(table.name, set);
    const rows = new Map<string, Row>();
    for (const snapshot of snapshots) for (const [id, row] of snapshot[table.name] ?? []) if (!rows.has(id)) rows.set(id, row);
    // Self-references can chain (a tag under an excluded tag), so repeat until nothing new is excluded.
    let grew = true;
    while (grew) {
      grew = false;
      for (const [id, row] of rows) {
        if (set.has(id)) continue;
        let out = id.startsWith(exclusions.idPrefix);
        if (!out && table.name === 'User') out = exclusions.userMobiles.includes(row.mobileNumber ?? '');
        if (!out && table.name === 'Question') out = (row.tags ?? '').includes(exclusions.questionTag);
        if (!out && table.name === 'Book') out = (row.title ?? '').startsWith(exclusions.bookTitlePrefix);
        if (!out) out = table.foreignKeys.some((fk) => row[fk.column] != null && excluded.get(fk.table)?.has(row[fk.column] as string));
        if (out) { set.add(id); grew = true; }
      }
    }
  }
  return excluded;
}

type Pending = 'need-up' | 'parent-up' | 'need-down';

export function planSync(input: PlanInput): Plan {
  const tables = input.tables ?? SYNC_TABLES;
  const { staging, live, ledger } = input;
  const excluded = excludedRows([staging, live], input.exclusions, tables);
  const stagingHashes = new Map<string, string>();
  const liveHashes = new Map<string, string>();
  for (const table of tables) {
    for (const [id, row] of staging[table.name] ?? []) stagingHashes.set(ledgerKey(table.name, id), rowHash(row));
    for (const [id, row] of live[table.name] ?? []) liveHashes.set(ledgerKey(table.name, id), rowHash(row));
  }

  const decisions = new Map<string, Decision>();
  const pending = new Map<string, Pending>();
  const decide = (table: string, id: string, action: Action, reason?: string) => {
    decisions.set(ledgerKey(table, id), { table, id, action, ...(reason ? { reason } : {}) });
    pending.delete(ledgerKey(table, id));
  };
  const actionOf = (table: string, id: string) => decisions.get(ledgerKey(table, id))?.action;

  // --- 1. Which side changed ---------------------------------------------------------------------------------
  for (const table of tables) {
    const ids = new Set<string>([...(staging[table.name]?.keys() ?? []), ...(live[table.name]?.keys() ?? [])]);
    for (const key of ledger.keys()) if (key.startsWith(`${table.name}:`)) ids.add(key.slice(table.name.length + 1));
    for (const id of ids) {
      const key = ledgerKey(table.name, id);
      if (excluded.get(table.name)?.has(id)) { decide(table.name, id, 'excluded', 'e2e test data'); continue; }
      const hs = stagingHashes.get(key);
      const hl = liveHashes.get(key);
      const base = ledger.get(key);

      if (!hs && !hl) { decide(table.name, id, 'forget'); continue; }
      if (hs && hl && hs === hl) { decide(table.name, id, 'in-sync'); continue; }

      if (table.direction === 'down') {
        if (hl) {
          // The live site is authoritative; staff accounts always come down, anyone else only if something needs them.
          const isUser = table.name === 'User';
          if (isUser && !STAFF_ROLES.has(live[table.name]!.get(id)!.role ?? '')) pending.set(key, 'need-down');
          else decide(table.name, id, 'replicate');
        } else if (base) {
          decide(table.name, id, table.deletable ? 'delete-staging' : 'kept', table.deletable ? undefined : 'removed on the live site; kept in staging');
        } else {
          decide(table.name, id, 'kept', 'exists only in staging; this table is managed on the live site');
        }
        continue;
      }

      if (hs && !hl) {
        if (!base) { gateUp(table, id); continue; }
        if (hs === base) decide(table.name, id, table.deletable ? 'delete-staging' : 'kept', table.deletable ? undefined : 'removed on the live site; kept in staging');
        else decide(table.name, id, 'conflict', 'changed in staging but removed on the live site');
        continue;
      }
      if (!hs && hl) {
        if (!base) { decide(table.name, id, 'replicate'); continue; }
        if (hl === base) decide(table.name, id, table.deletable ? 'delete-live' : 'kept', table.deletable ? undefined : 'removed in staging; never deleted from the live site');
        else decide(table.name, id, 'conflict', 'changed on the live site but removed in staging');
        continue;
      }
      // Both exist and differ.
      if (base === hl) gateUp(table, id);
      else if (base === hs) decide(table.name, id, 'replicate');
      else decide(table.name, id, 'conflict', base ? 'changed on both sides since the last sync' : 'differs on the two sides and was never synced');
    }
  }

  // --- 2. Approval gates for what changed in staging -------------------------------------------------------
  function gateUp(table: SyncTable, id: string) {
    const row = staging[table.name]!.get(id)!;
    const isLive = live[table.name]?.has(id) ?? false;
    if (table.gate === 'status') {
      const status = row.status ?? '';
      if (!PROMOTABLE_STATUSES.has(status)) return decide(table.name, id, 'held', `awaiting approval (status ${status || 'none'})`);
      if (!isLive && status === 'ARCHIVED') return decide(table.name, id, 'held', 'archived before it went live');
      return decide(table.name, id, 'promote');
    }
    if (table.gate === 'question') {
      const questionId = row[table.questionColumn ?? 'questionId'];
      if (questionId == null) {
        // A page-level figure: goes with its page.
        return isLive ? decide(table.name, id, 'promote') : void pending.set(ledgerKey(table.name, id), 'parent-up');
      }
      const question = staging.Question?.get(questionId);
      const action = actionOf('Question', questionId);
      const approved = question != null && PROMOTABLE_STATUSES.has(question.status ?? '');
      const questionLive = (live.Question?.has(questionId) ?? false) || action === 'promote';
      if (approved && questionLive && action !== 'conflict' && action !== 'held') return decide(table.name, id, 'promote');
      return decide(table.name, id, 'held', 'its question is not approved');
    }
    if (isLive) return decide(table.name, id, 'promote');
    pending.set(ledgerKey(table.name, id), table.gate === 'parent' ? 'parent-up' : 'need-up');
  }

  // --- 3. Parents travel with their children; children whose parents cannot are blocked ----------------------
  const tableOf = new Map(tables.map((t) => [t.name, t]));
  const promotedByNeed = new Set<string>();

  const liveAfter = (table: string, id: string) => {
    const action = actionOf(table, id);
    if (action === 'promote') return true;
    if (action === 'delete-live') return false;
    return live[table]?.has(id) ?? false;
  };
  const stagingAfter = (table: string, id: string) => {
    const action = actionOf(table, id);
    if (action === 'replicate') return true;
    if (action === 'delete-staging') return false;
    return staging[table]?.has(id) ?? false;
  };

  for (;;) {
    // 3a. Pull pending parents (and pages that follow a live parent) up while anything changes.
    let pulled = true;
    while (pulled) {
      pulled = false;
      for (const d of [...decisions.values()]) {
        if (d.action !== 'promote') continue;
        const row = staging[d.table]?.get(d.id);
        if (!row) continue;
        for (const fk of tableOf.get(d.table)!.foreignKeys) {
          const parentId = row[fk.column];
          if (parentId == null || liveAfter(fk.table, parentId)) continue;
          const key = ledgerKey(fk.table, parentId);
          if (pending.get(key) === 'need-up' || pending.get(key) === 'parent-up') {
            decide(fk.table, parentId, 'promote', `needed by ${d.table} ${d.id}`);
            promotedByNeed.add(key);
            pulled = true;
          }
        }
      }
      for (const [key, kind] of [...pending]) {
        if (kind !== 'parent-up') continue;
        const [table, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
        const t = tableOf.get(table)!;
        const parentColumn = t.followsParent ?? (table === 'PageFigure' ? 'documentPageId' : undefined);
        const parentTable = t.foreignKeys.find((fk) => fk.column === parentColumn)?.table;
        const parentId = parentColumn ? staging[table]?.get(id)?.[parentColumn] : null;
        if (parentTable && parentId != null && liveAfter(parentTable, parentId)) {
          decide(table, id, 'promote', `its ${parentTable} is live`);
          promotedByNeed.add(key);
          pulled = true;
        }
      }
    }

    // 3b. Block anything promoted whose parent will not be on the live site.
    let blockedAny = false;
    for (const d of [...decisions.values()]) {
      if (d.action !== 'promote') continue;
      const row = staging[d.table]?.get(d.id);
      if (!row) continue;
      for (const fk of tableOf.get(d.table)!.foreignKeys) {
        const parentId = row[fk.column];
        if (parentId == null || liveAfter(fk.table, parentId)) continue;
        const why = fk.table === 'User' ? 'its author account is not on the live site' : `needs ${fk.table} ${parentId}, which cannot go live (${actionOf(fk.table, parentId) ?? 'missing'})`;
        decide(d.table, d.id, 'blocked', why);
        blockedAny = true;
        break;
      }
    }
    if (!blockedAny) break;
    // Something was blocked: anything promoted only because it was needed may no longer be. Start the pull again.
    for (const key of promotedByNeed) {
      const d = decisions.get(key)!;
      if (d.action === 'promote') {
        decisions.delete(key);
        pending.set(key, tableOf.get(d.table)!.gate === 'parent' || d.table === 'PageFigure' ? 'parent-up' : 'need-up');
      }
    }
    promotedByNeed.clear();
  }

  // --- 4. The same on the way down: replicated rows bring the accounts they need ------------------------------
  let pulledDown = true;
  while (pulledDown) {
    pulledDown = false;
    for (const d of [...decisions.values()]) {
      if (d.action !== 'replicate') continue;
      const row = live[d.table]?.get(d.id);
      if (!row) continue;
      for (const fk of tableOf.get(d.table)!.foreignKeys) {
        const parentId = row[fk.column];
        if (parentId == null || stagingAfter(fk.table, parentId)) continue;
        const key = ledgerKey(fk.table, parentId);
        if (pending.get(key) === 'need-down') {
          decide(fk.table, parentId, 'replicate', `needed by ${d.table} ${d.id}`);
          pulledDown = true;
        } else {
          decide(d.table, d.id, 'blocked', `needs ${fk.table} ${parentId}, which cannot come down (${actionOf(fk.table, parentId) ?? 'missing'})`);
          pulledDown = true;
          break;
        }
      }
    }
  }

  // --- 5. Whatever is still waiting ---------------------------------------------------------------------------
  for (const [key, kind] of pending) {
    const [table, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    if (kind === 'need-down') decisions.set(key, { table, id, action: 'kept', reason: 'not a staff account and nothing in staging needs it' });
    else decisions.set(key, { table, id, action: 'held', reason: kind === 'parent-up' ? 'its parent is not live yet' : 'nothing approved needs it yet' });
  }

  // Parents first, in table order, so the caller can write them as listed.
  const order = new Map(tables.map((t, i) => [t.name, i]));
  const list = [...decisions.values()].sort((a, b) => (order.get(a.table)! - order.get(b.table)!) || a.id.localeCompare(b.id));
  return { decisions: list, stagingHashes, liveHashes };
}

/** Counts of each action per table, for a report. */
export function summarise(plan: Plan): Record<string, Partial<Record<Action, number>>> {
  const out: Record<string, Partial<Record<Action, number>>> = {};
  for (const d of plan.decisions) {
    const t = (out[d.table] ??= {});
    t[d.action] = (t[d.action] ?? 0) + 1;
  }
  return out;
}

/** Self-referencing rows (a tag under a tag) ordered so every parent comes before its children. */
export function parentsFirst(rows: Row[], parentColumn: string | undefined): Row[] {
  if (!parentColumn) return rows;
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  const done = new Set<string>();
  const out: Row[] = [];
  const visit = (row: Row, depth: number) => {
    const id = row.id as string;
    if (done.has(id) || depth > rows.length) return;
    const parent = row[parentColumn];
    if (parent && byId.has(parent)) visit(byId.get(parent)!, depth + 1);
    if (!done.has(id)) { done.add(id); out.push(row); }
  };
  for (const row of rows) visit(row, 0);
  return out;
}
