import { contentRole } from '@/lib/content-role';
import { problemsWithTestDatabase } from '@/lib/test-database-guard';

export type SyncConnection =
  | { ready: true; stagingUrl: string; liveUrl: string }
  | { ready: false; reason: string };

/**
 * Where the staging server's sync reads and writes: its own database (DATABASE_URL) is staging, and
 * LIVE_DATABASE_URL names the live one. Publishing is only possible from a staging server that has both.
 */
export function syncConnection(env: Record<string, string | undefined> = process.env): SyncConnection {
  if (contentRole(env) !== 'staging') {
    return { ready: false, reason: 'This is the live site. Content is published from the staging site.' };
  }
  const stagingUrl = env.DATABASE_URL;
  const liveUrl = env.LIVE_DATABASE_URL;
  if (!stagingUrl || !liveUrl) {
    return { ready: false, reason: 'This staging server does not know where the live database is: set LIVE_DATABASE_URL.' };
  }
  const problems = problemsWithTestDatabase(stagingUrl, liveUrl);
  if (problems.length) return { ready: false, reason: problems.join(' ') };
  return { ready: true, stagingUrl, liveUrl };
}
