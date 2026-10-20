import { describe, expect, it } from 'vitest';
import { contentRole, isStagingOnlyWrite } from './content-role';

describe('contentRole', () => {
  it('is staging only when explicitly configured; anything else is live', () => {
    expect(contentRole({ CONTENT_ROLE: 'staging' })).toBe('staging');
    expect(contentRole({ CONTENT_ROLE: ' Staging ' })).toBe('staging');
    expect(contentRole({ CONTENT_ROLE: 'live' })).toBe('live');
    expect(contentRole({})).toBe('live');
    expect(contentRole({ CONTENT_ROLE: 'stage' })).toBe('live');
  });
});

describe('isStagingOnlyWrite', () => {
  it('blocks importing and extracting into the bank', () => {
    expect(isStagingOnlyWrite('/api/admin/books', 'POST')).toBe(true);
    expect(isStagingOnlyWrite('/api/admin/books/b1/upload-sessions/s1/chunks/3', 'PUT')).toBe(true);
    expect(isStagingOnlyWrite('/api/admin/books/b1/ingestions/r1/extract-questions', 'POST')).toBe(true);
    expect(isStagingOnlyWrite('/api/admin/books/b1/manifest', 'PATCH')).toBe(true);
    expect(isStagingOnlyWrite('/api/admin/ingest/sessions/x/parse-direct', 'POST')).toBe(true);
    expect(isStagingOnlyWrite('/api/admin/extract-pdf', 'POST')).toBe(true);
    expect(isStagingOnlyWrite('/api/admin/bulk-insert', 'POST')).toBe(true);
    expect(isStagingOnlyWrite('/api/admin/book-drafts/r1/extend', 'POST')).toBe(true);
    expect(isStagingOnlyWrite('/api/admin/revision-items/i1', 'DELETE')).toBe(true);
  });

  it('still lets an admin look at books and pages on the live site', () => {
    expect(isStagingOnlyWrite('/api/admin/books', 'GET')).toBe(false);
    expect(isStagingOnlyWrite('/api/admin/books/b1/pages/3/image', 'GET')).toBe(false);
    expect(isStagingOnlyWrite('/api/admin/books/b1/page-questions', 'HEAD')).toBe(false);
  });

  it('leaves teachers\' own tools and unrelated admin work alone', () => {
    expect(isStagingOnlyWrite('/api/extract-vision', 'POST')).toBe(false);
    expect(isStagingOnlyWrite('/api/teacher/questions', 'POST')).toBe(false);
    expect(isStagingOnlyWrite('/api/admin/batches', 'POST')).toBe(false);
    expect(isStagingOnlyWrite('/api/admin/question-flags/f1', 'PATCH')).toBe(false);
  });

  it('matches whole path segments, not look-alike prefixes', () => {
    expect(isStagingOnlyWrite('/api/admin/booksellers', 'POST')).toBe(false);
    expect(isStagingOnlyWrite('/api/admin/bulk-insertion-report', 'POST')).toBe(false);
  });
});
