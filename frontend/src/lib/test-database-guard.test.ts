import { describe, expect, it } from 'vitest';
import { describeDatabaseUrl, problemsWithTestDatabase } from './test-database-guard';

const real = 'postgresql://postgres.realref:secret@aws-1-ap-south-1.pooler.supabase.com:5432/postgres';

describe('describeDatabaseUrl', () => {
  it('reads host, port, database and schema, never the credentials', () => {
    expect(describeDatabaseUrl('postgresql://u:p@Db.Example.com/mydb?schema=app')).toEqual({ host: 'db.example.com', port: '5432', database: 'mydb', schema: 'app' });
    expect(JSON.stringify(describeDatabaseUrl(real))).not.toContain('secret');
  });

  it('returns null for anything that is not a postgres url', () => {
    expect(describeDatabaseUrl(undefined)).toBeNull();
    expect(describeDatabaseUrl('')).toBeNull();
    expect(describeDatabaseUrl('not a url')).toBeNull();
    expect(describeDatabaseUrl('mysql://u:p@host/db')).toBeNull();
    expect(describeDatabaseUrl('postgresql://u:p@host')).toBeNull();
  });
});

describe('problemsWithTestDatabase', () => {
  it('requires a test database', () => {
    expect(problemsWithTestDatabase(undefined, real)).toEqual(['STAGING_DATABASE_URL is not set.']);
    expect(problemsWithTestDatabase('garbage', real)[0]).toMatch(/not a readable/);
  });

  it('refuses the same database as the real one, even with a different password or query string', () => {
    expect(problemsWithTestDatabase(real, real)).toHaveLength(1);
    const sameDifferentParams = 'postgresql://postgres.realref:other@AWS-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require&pgbouncer=true';
    expect(problemsWithTestDatabase(sameDifferentParams, real)).toHaveLength(1);
  });

  it('accepts another Supabase project on the same pooler host, told apart by the project in the user name', () => {
    expect(problemsWithTestDatabase('postgresql://postgres.testref:pw@aws-1-ap-south-1.pooler.supabase.com:5432/postgres', real)).toEqual([]);
  });

  it('accepts a different server, database or schema', () => {
    expect(problemsWithTestDatabase('postgresql://u:p@localhost:5432/mathswiz_e2e', real)).toEqual([]);
    expect(problemsWithTestDatabase('postgresql://postgres.realref:s@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?schema=e2e', real)).toEqual([]);
  });

  it('has nothing to collide with when the real url is unknown', () => {
    expect(problemsWithTestDatabase('postgresql://u:p@localhost/e2e', undefined)).toEqual([]);
  });
});
