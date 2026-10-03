import { beforeEach, describe, expect, it, vi } from 'vitest';

const bookIngestionRun = { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() };
const documentPage = { findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() };
const pageExtractionBenchmark = { deleteMany: vi.fn() };
const question = { deleteMany: vi.fn(), updateMany: vi.fn() };
const pageFigure = { deleteMany: vi.fn() };
const removePrivateImage = vi.fn();

vi.mock('./prisma', () => ({ default: { bookIngestionRun, documentPage, pageExtractionBenchmark, question, pageFigure } }));
vi.mock('./book-storage', () => ({ removePrivateImage }));

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-03T00:00:00Z');

describe('draft-retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    removePrivateImage.mockResolvedValue(undefined);
    bookIngestionRun.update.mockResolvedValue({});
    documentPage.updateMany.mockResolvedValue({ count: 3 });
    pageExtractionBenchmark.deleteMany.mockResolvedValue({ count: 2 });
  });

  it('keeps a draft for exactly 60 days and counts the days left, rounding up', async () => {
    const { DRAFT_RETENTION_DAYS, draftExpiryFrom, daysUntilExpiry } = await import('./draft-retention');
    expect(DRAFT_RETENTION_DAYS).toBe(60);
    expect(draftExpiryFrom(now).getTime() - now.getTime()).toBe(60 * DAY);
    expect(daysUntilExpiry(new Date(now.getTime() + 60 * DAY), now)).toBe(60);
    expect(daysUntilExpiry(new Date(now.getTime() + 1000), now)).toBe(1);
    expect(daysUntilExpiry(new Date(now.getTime() - DAY), now)).toBe(-1);
  });

  describe('startDraftClock', () => {
    it('starts the clock for a run that has none', async () => {
      bookIngestionRun.findUnique.mockResolvedValue({ draftExpiresAt: null, draftPurgedAt: null });
      const { startDraftClock } = await import('./draft-retention');
      const expiry = await startDraftClock('run-1', now);
      expect(expiry!.getTime() - now.getTime()).toBe(60 * DAY);
      expect(bookIngestionRun.update).toHaveBeenCalledWith({ where: { id: 'run-1' }, data: { draftExpiresAt: expiry } });
    });

    it('moves the clock later on new activity but never earlier', async () => {
      const { startDraftClock } = await import('./draft-retention');
      bookIngestionRun.findUnique.mockResolvedValue({ draftExpiresAt: new Date(now.getTime() + 10 * DAY), draftPurgedAt: null });
      await startDraftClock('run-1', now);
      expect(bookIngestionRun.update).toHaveBeenCalledTimes(1);

      bookIngestionRun.update.mockClear();
      const later = new Date(now.getTime() + 90 * DAY);
      bookIngestionRun.findUnique.mockResolvedValue({ draftExpiresAt: later, draftPurgedAt: null });
      expect(await startDraftClock('run-1', now)).toEqual(later);
      expect(bookIngestionRun.update).not.toHaveBeenCalled();
    });

    it('leaves an already-purged draft alone', async () => {
      bookIngestionRun.findUnique.mockResolvedValue({ draftExpiresAt: now, draftPurgedAt: now });
      const { startDraftClock } = await import('./draft-retention');
      expect(await startDraftClock('run-1', now)).toBeNull();
      expect(bookIngestionRun.update).not.toHaveBeenCalled();
    });
  });

  describe('purgeExpiredDrafts', () => {
    const due = [{ id: 'run-1', sourceDocumentId: 'doc-1', draftExpiresAt: new Date(now.getTime() - DAY), book: { title: 'Xam Idea Mathematics' } }];

    it('only asks for runs that are past their expiry and not yet purged', async () => {
      bookIngestionRun.findMany.mockResolvedValue([]);
      const { purgeExpiredDrafts } = await import('./draft-retention');
      await purgeExpiredDrafts({ now });
      expect(bookIngestionRun.findMany.mock.calls[0][0].where).toEqual({ draftExpiresAt: { lte: now }, draftPurgedAt: null });
    });

    it('a dry run reports what is due and changes nothing', async () => {
      bookIngestionRun.findMany.mockResolvedValue(due);
      const { purgeExpiredDrafts } = await import('./draft-retention');
      const result = await purgeExpiredDrafts({ now, dryRun: true });
      expect(result.due).toEqual([{ runId: 'run-1', bookTitle: 'Xam Idea Mathematics', expiresAt: due[0].draftExpiresAt }]);
      expect(result.purged).toEqual([]);
      expect(removePrivateImage).not.toHaveBeenCalled();
      expect(documentPage.updateMany).not.toHaveBeenCalled();
      expect(bookIngestionRun.update).not.toHaveBeenCalled();
    });

    it('clears the page buffer but keeps the page rows, questions and figures', async () => {
      bookIngestionRun.findMany.mockResolvedValue(due);
      documentPage.findMany.mockResolvedValue([
        { pageImagePath: 'books/b/r/pages/page-001.jpg', processedImagePath: 'books/b/r/pages/page-001-processed.jpg' },
        { pageImagePath: 'books/b/r/pages/page-002.jpg', processedImagePath: null },
      ]);
      const { purgeExpiredDrafts } = await import('./draft-retention');
      const result = await purgeExpiredDrafts({ now });

      expect(removePrivateImage).toHaveBeenCalledTimes(3);
      expect(pageExtractionBenchmark.deleteMany).toHaveBeenCalledWith({ where: { ingestionRunId: 'run-1' } });
      const cleared = documentPage.updateMany.mock.calls[0][0];
      expect(cleared.where).toEqual({ documentId: 'doc-1' });
      expect(cleared.data).toMatchObject({ rawMarkdown: '', rawText: '', nativeText: null, pageImagePath: null, processedImagePath: null, imageUrls: [] });
      // Rows are emptied, never deleted: PageFigure links approved questions to their diagrams through them.
      expect(documentPage.deleteMany).not.toHaveBeenCalled();
      expect(question.deleteMany).not.toHaveBeenCalled();
      expect(question.updateMany).not.toHaveBeenCalled();
      expect(pageFigure.deleteMany).not.toHaveBeenCalled();
      expect(bookIngestionRun.update).toHaveBeenCalledWith({ where: { id: 'run-1' }, data: { draftPurgedAt: now } });
      expect(result.purged[0]).toMatchObject({ bookTitle: 'Xam Idea Mathematics', pagesCleared: 3, filesRemoved: 3, benchmarksRemoved: 2, fileErrors: 0 });
    });

    it('still clears the database when a stored file cannot be removed, and counts the failure', async () => {
      bookIngestionRun.findMany.mockResolvedValue(due);
      documentPage.findMany.mockResolvedValue([{ pageImagePath: 'a.jpg', processedImagePath: null }, { pageImagePath: 'b.jpg', processedImagePath: null }]);
      removePrivateImage.mockRejectedValueOnce(new Error('storage down')).mockResolvedValue(undefined);
      const { purgeExpiredDrafts } = await import('./draft-retention');
      const result = await purgeExpiredDrafts({ now });
      expect(result.purged[0]).toMatchObject({ filesRemoved: 1, fileErrors: 1 });
      expect(bookIngestionRun.update).toHaveBeenCalledWith({ where: { id: 'run-1' }, data: { draftPurgedAt: now } });
    });
  });
});
