/**
 * Starts the STAGING site on this computer, next to the normal dev server:
 *
 *   npm run dev:staging      -> http://localhost:3200
 *
 * It uses the staging database (STAGING_DATABASE_URL in .env.staging), knows where live is (to publish), allows
 * imports and extraction (CONTENT_ROLE=staging), and builds into its own folder so it never collides with
 * `npm run dev` on port 3000, which stays on the live database.
 */
import { spawn } from 'node:child_process';
import { readDatabaseUrls } from '../e2e/test-database';
import { problemsWithTestDatabase } from '../src/lib/test-database-guard';

const PORT = 3200;
const { stagingUrl, liveUrl } = readDatabaseUrls();
const problems = problemsWithTestDatabase(stagingUrl, liveUrl);
if (problems.length || !liveUrl) {
  console.error(`Cannot start the staging site:\n  - ${[...problems, ...(liveUrl ? [] : ['DATABASE_URL (live) is missing from .env.local'])].join('\n  - ')}`);
  process.exit(1);
}

const child = spawn('node', ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--port', String(PORT)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: stagingUrl,
    LIVE_DATABASE_URL: liveUrl,
    CONTENT_ROLE: 'staging',
    NEXTAUTH_URL: `http://localhost:${PORT}`,
    NEXT_DIST_DIR: '.next-staging',
  },
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
