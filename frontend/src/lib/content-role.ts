/**
 * Which part a running server plays in the content workflow:
 *   - staging: admins import, extract, correct and approve questions here (STAGING database);
 *   - live:    students and teachers use the site; approved content arrives here from staging.
 *
 * Set with CONTENT_ROLE=staging on the staging server (`npm run dev:staging` does it). Anything else is live, so a
 * server that was never configured can never accept imports into the live question bank.
 */

export type ContentRole = 'live' | 'staging';

export function contentRole(env: Record<string, string | undefined> = process.env): ContentRole {
  return env.CONTENT_ROLE?.trim().toLowerCase() === 'staging' ? 'staging' : 'live';
}

/**
 * Admin endpoints that import or extract content into the question bank. On the live site only reads are allowed
 * (an admin can still look at books and pages); every change happens in staging and is published from there.
 * Teachers' own tools (/api/extract*, /api/teacher/...) are not here: what teachers make on the live site is theirs
 * and is copied down to staging by the sync.
 */
export const STAGING_ONLY_WRITE_PREFIXES = [
  '/api/admin/books',
  '/api/admin/book-drafts',
  '/api/admin/ingest/',
  '/api/admin/extract-mathpix',
  '/api/admin/extract-pdf',
  '/api/admin/bulk-insert',
  '/api/admin/auto-populate',
  '/api/admin/revision-items/',
];

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** True when this request would import or extract content, which only the staging site may do. */
export function isStagingOnlyWrite(path: string, method: string): boolean {
  if (READ_METHODS.has(method.toUpperCase())) return false;
  return STAGING_ONLY_WRITE_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`));
}

export const IMPORTS_ON_STAGING_MESSAGE =
  'Importing and extracting questions happens on the staging site, not the live one. Open the staging site to do this; approved questions reach students when they are published from there.';
