// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { upsertKeepingPositions } from './run';

describe('upsertKeepingPositions', () => {
  it('moves the parents\' rows aside, writes, then puts back what was not written', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const client = { query: async (sql: string, params: unknown[] = []) => { queries.push({ sql: sql.replace(/\s+/g, ' '), params }); return { rows: [] }; } };
    await upsertKeepingPositions(client as never, 'BookExercise', [
      { id: 'b', chapterId: 'ch1', orderIndex: '0' },
      { id: 'n', chapterId: 'ch1', orderIndex: '1' },
      { id: 'y', chapterId: 'ch2', orderIndex: '0' },
    ], { scope: 'chapterId', column: 'orderIndex' });

    expect(queries.map((q) => q.sql.split(' ').slice(0, 2).join(' '))).toEqual(['update "BookExercise"', 'insert into', 'update "BookExercise"', 'update "BookExercise"']);
    expect(queries[0].sql).toContain('set "orderIndex" = -1 - "orderIndex" where "chapterId" = any($1) and "orderIndex" >= 0');
    expect(queries[0].params).toEqual([['ch1', 'ch2']]);
    expect(queries[1].sql).toContain('on conflict ("id") do update');
    expect(queries[2].sql).toContain('not exists');
  });

  it('does nothing when there is nothing to write', async () => {
    const queries: string[] = [];
    await upsertKeepingPositions({ query: async (sql: string) => { queries.push(sql); return { rows: [] }; } } as never, 'BookExercise', [], { scope: 'chapterId', column: 'orderIndex' });
    expect(queries).toEqual([]);
  });
});
