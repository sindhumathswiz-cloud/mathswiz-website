// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeReferences, IGNORED_USER_REFERENCES, USER_REFERENCES } from './user-references';

/** Every "field -> User" foreign key declared in the Prisma schema, as "Model.field". */
function userForeignKeys(): string[] {
  const schema = readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const out: string[] = [];
  for (const [, model, body] of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    for (const line of body.split('\n')) {
      const m = line.match(/^\s*\w+\s+User\??\s+@relation\([^)]*fields:\s*\[(\w+)\]/);
      if (m) out.push(`${model}.${m[1]}`);
    }
  }
  return out.sort();
}

describe('USER_REFERENCES', () => {
  it('covers every table that points at a user, so nothing can be missed when deciding whether to delete', () => {
    const listed = [...USER_REFERENCES, ...IGNORED_USER_REFERENCES].map((r) => `${r.model}.${r.field}`).sort();
    expect(listed).toEqual(userForeignKeys());
  });

  it('lists each reference once', () => {
    const keys = USER_REFERENCES.map((r) => `${r.model}.${r.field}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('describeReferences', () => {
  const ref = (label: string, count: number, one = label) => ({ model: 'X', field: 'y', label, one, count });

  it('reads as a sentence and leaves out what is not there', () => {
    expect(describeReferences([ref('questions authored', 1200), ref('tests created', 0), ref('test attempts', 3)])).toBe('1,200 questions authored and 3 test attempts');
    expect(describeReferences([ref('a', 1), ref('b', 2), ref('c', 3)])).toBe('1 a, 2 b and 3 c');
    expect(describeReferences([ref('test attempts', 4)])).toBe('4 test attempts');
    expect(describeReferences([ref('test attempts', 0)])).toBe('');
    expect(describeReferences([ref('batches taught', 1, 'batch taught'), ref('questions authored', 42, 'question authored')])).toBe('1 batch taught and 42 questions authored');
  });
});
