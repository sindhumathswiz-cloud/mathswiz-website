/**
 * The staging database (where admins import and approve content, and where the end-to-end suite deletes and
 * recreates its fixtures on every run) must never be the live database. This is the check that says whether a
 * connection string is safe to use as staging: present, readable, and not the same database as the live one.
 */

export interface DatabaseTarget {
  host: string;
  port: string;
  database: string;
  schema: string;
}

/** Where a Postgres connection string points, without its credentials. Null when it cannot be read. */
export function describeDatabaseUrl(url: string | undefined | null): DatabaseTarget | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!/^postgres(ql)?:$/.test(parsed.protocol)) return null;
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    if (!parsed.hostname || !database) return null;
    return {
      host: parsed.hostname.toLowerCase(),
      port: parsed.port || '5432',
      database,
      schema: parsed.searchParams.get('schema') || 'public',
    };
  } catch {
    return null;
  }
}

/**
 * Supabase's pooler hosts every project on the same host name and tells them apart by the user name
 * ("postgres.<project-ref>"), so that user is part of what identifies the database.
 */
function projectOf(url: string): string {
  try {
    const user = decodeURIComponent(new URL(url).username);
    const dot = user.indexOf('.');
    return dot >= 0 ? user.slice(dot + 1) : '';
  } catch {
    return '';
  }
}

/** Reasons the test connection string must not be used. An empty list means it is safe. */
export function problemsWithTestDatabase(testUrl: string | undefined | null, realUrl: string | undefined | null): string[] {
  if (!testUrl) return ['STAGING_DATABASE_URL is not set.'];
  const test = describeDatabaseUrl(testUrl);
  if (!test) return ['STAGING_DATABASE_URL is not a readable postgres:// connection string.'];

  const real = describeDatabaseUrl(realUrl);
  if (!real) return []; // nothing to collide with
  const sameServer = test.host === real.host && test.port === real.port;
  if (sameServer && test.database === real.database && test.schema === real.schema && projectOf(testUrl) === projectOf(realUrl as string)) {
    return ['STAGING_DATABASE_URL points at the same database as the live DATABASE_URL. Staging must be a separate database.'];
  }
  return [];
}
