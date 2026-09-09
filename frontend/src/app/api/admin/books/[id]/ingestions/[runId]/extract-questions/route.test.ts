import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();
const getPageRawText = vi.fn();
const structurePageQuestions = vi.fn();
const cropPageRegion = vi.fn();

const bookIngestionRun = { findFirst: vi.fn(), update: vi.fn() };
const book = { findUnique: vi.fn() };
const documentPage = { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn() };
const question = { findMany: vi.fn(), create: vi.fn() };
const questionImage = { create: vi.fn() };
const bookChapter = { findFirst: vi.fn(), aggregate: vi.fn(), create: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { bookIngestionRun, book, documentPage, question, questionImage, bookChapter } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));
vi.mock('@/lib/extract-book-page', () => ({ getPageRawText, structurePageQuestions }));
vi.mock('@/lib/page-image-crop', () => ({ cropPageRegion }));
// isLikelyCaseStudyFragment is left un-mocked (real implementation) — it's a
// pure regex/shape check, and using the real thing here is what actually
// exercises the stitching decisions below rather than just asserting on a stub.

function post(body: unknown) {
  return new Request('http://localhost/api/admin/books/book-1/ingestions/run-1/extract-questions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'book-1', runId: 'run-1' });

const CASE_STUDY_PASSAGE = 'Read the following and answer any four questions from (i) to (v).\n\nA general election of Lok Sabha is a gigantic exercise.';
const CASE_STUDY_SUBQUESTIONS = '(i) Which of the following is true?\n(a) X\n(b) Y';

describe('POST /api/admin/books/[id]/ingestions/[runId]/extract-questions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1', sourceDocumentId: 'doc-1', totalPages: 2, extractedQuestions: 0, reviewRequired: 0, providerConfig: null });
    bookIngestionRun.update.mockResolvedValue({ extractedQuestions: 1, reviewRequired: 0, stage: 'QUESTION_EXTRACTION' });
    book.findUnique.mockResolvedValue({ className: 'Class 12', subject: 'Mathematics' });
    question.findMany.mockResolvedValue([]);
    question.create.mockResolvedValue({ id: 'q-1' });
    documentPage.update.mockResolvedValue({});
    documentPage.findFirst.mockResolvedValue(null);
    documentPage.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    bookChapter.findFirst.mockResolvedValue(null);
    bookChapter.aggregate.mockResolvedValue({ _max: { orderIndex: null } });
    bookChapter.create.mockResolvedValue({ id: 'chapter-1' });
    cropPageRegion.mockResolvedValue({ imagePath: '/private/crop.jpg', width: 200, height: 200 });
    questionImage.create.mockResolvedValue({ id: 'qi-1' });
  });

  it('rejects non-admin callers', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    expect(response.status).toBe(403);
  });

  it('requires pages to have been rendered first', async () => {
    bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1', sourceDocumentId: null, totalPages: null, extractedQuestions: 0, reviewRequired: 0, providerConfig: null });
    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    expect(response.status).toBe(409);
  });

  it('extracts, saves and de-duplicates questions, and marks pages completed', async () => {
    documentPage.findMany.mockResolvedValue([
      { id: 'page-1', pageNumber: 1, nativeText: 'text', pageImagePath: '/p1.png', processedImagePath: null, layoutData: null },
      { id: 'page-2', pageNumber: 2, nativeText: 'text', pageImagePath: '/p2.png', processedImagePath: null, layoutData: { requiresVisionSegmentation: true } },
    ]);
    getPageRawText
      .mockResolvedValueOnce({ provider: 'NATIVE_TEXT', rawText: 'page one text', ocrConfidence: null })
      .mockResolvedValueOnce({ provider: 'MATHPIX_OCR', rawText: 'page two text', ocrConfidence: 0.9 });
    structurePageQuestions
      .mockResolvedValueOnce([{ question: { questionContent: 'Q1', type: 'SUBJECTIVE', difficulty: 'EASY', options: [], correctAnswer: '', explanation: 'sol', tags: [], topic: 'Integration by parts basics', method: 'Integration by parts', printedNumber: '', explanationType: 'FULL' }, contentHash: 'hash-1', qaIssues: [] }])
      .mockResolvedValueOnce([{ question: { questionContent: 'Q2', type: 'INTEGER', difficulty: 'HARD', options: [], correctAnswer: '5', explanation: '', tags: [], topic: '', method: '', printedNumber: '', explanationType: 'NONE' }, contentHash: 'hash-2', qaIssues: [{ severity: 'error', code: 'X', message: 'bad' }] }]);
    // hash-2 already exists as an APPROVED question elsewhere -> duplicate, not saved.
    question.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ contentHash: 'hash-2' }]);

    const { POST } = await import('./route');
    const response = (await POST(post({ startPage: 1, batchSize: 5 }), { params })) as Response;
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(question.create).toHaveBeenCalledTimes(1);
    expect(question.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        content: 'Q1', contentHash: 'hash-1', bookId: 'book-1', status: 'DRAFT', sourcePageStart: 1, sourcePageEnd: 1, verificationStatus: 'STRUCTURALLY_VALID',
        // "Integration by parts basics" snaps to the canonical CBSE chapter "Integrals" via chapter-classifier's alias list.
        topic: 'Integrals', subTopic: 'Integration by parts', bookChapterId: 'chapter-1',
      }),
    }));
    expect(bookChapter.create).toHaveBeenCalledWith({ data: { bookId: 'book-1', name: 'Integrals', orderIndex: 1 } });
    expect(data.batch.saved).toBe(1);
    expect(data.batch.duplicates).toBe(1);
    expect(documentPage.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'page-1' }, data: expect.objectContaining({ status: 'COMPLETED', ocrProvider: 'NATIVE_TEXT' }) }));
    expect(documentPage.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'page-2' }, data: expect.objectContaining({ status: 'COMPLETED', ocrProvider: 'MATHPIX_OCR' }) }));
  });

  describe('explanationType-derived tags', () => {
    it('tags a HINT-only question with "Questions without Solutions" and "Hint Available"', async () => {
      documentPage.findMany.mockResolvedValue([
        { id: 'page-1', pageNumber: 1, nativeText: 'text', pageImagePath: '/p1.png', processedImagePath: null, layoutData: null },
      ]);
      getPageRawText.mockResolvedValueOnce({ provider: 'NATIVE_TEXT', rawText: 'page text', ocrConfidence: null });
      structurePageQuestions.mockResolvedValueOnce([
        { question: { questionContent: 'Q1', type: 'SUBJECTIVE', difficulty: 'EASY', options: [], correctAnswer: '', explanation: 'Hint: use substitution.', explanationType: 'HINT', tags: [], topic: '', method: '', printedNumber: '' }, contentHash: 'hash-hint', qaIssues: [] },
      ]);

      const { POST } = await import('./route');
      await POST(post({ startPage: 1, batchSize: 5 }), { params });

      expect(question.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ tags: expect.arrayContaining(['Questions without Solutions', 'Hint Available']) }),
      }));
    });

    it('tags a question with no solution or hint at all with only "Questions without Solutions"', async () => {
      documentPage.findMany.mockResolvedValue([
        { id: 'page-1', pageNumber: 1, nativeText: 'text', pageImagePath: '/p1.png', processedImagePath: null, layoutData: null },
      ]);
      getPageRawText.mockResolvedValueOnce({ provider: 'NATIVE_TEXT', rawText: 'page text', ocrConfidence: null });
      structurePageQuestions.mockResolvedValueOnce([
        { question: { questionContent: 'Q1', type: 'SUBJECTIVE', difficulty: 'EASY', options: [], correctAnswer: '', explanation: '', explanationType: 'NONE', tags: ['CBSE 2019'], topic: '', method: '', printedNumber: '' }, contentHash: 'hash-none', qaIssues: [] },
      ]);

      const { POST } = await import('./route');
      await POST(post({ startPage: 1, batchSize: 5 }), { params });

      expect(question.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ tags: ['CBSE 2019', 'Questions without Solutions'] }),
      }));
    });

    it('does not add either tag when a full solution was captured', async () => {
      documentPage.findMany.mockResolvedValue([
        { id: 'page-1', pageNumber: 1, nativeText: 'text', pageImagePath: '/p1.png', processedImagePath: null, layoutData: null },
      ]);
      getPageRawText.mockResolvedValueOnce({ provider: 'NATIVE_TEXT', rawText: 'page text', ocrConfidence: null });
      structurePageQuestions.mockResolvedValueOnce([
        { question: { questionContent: 'Q1', type: 'SUBJECTIVE', difficulty: 'EASY', options: [], correctAnswer: '', explanation: 'Full worked solution.', explanationType: 'FULL', tags: [], topic: '', method: '', printedNumber: '' }, contentHash: 'hash-full', qaIssues: [] },
      ]);

      const { POST } = await import('./route');
      await POST(post({ startPage: 1, batchSize: 5 }), { params });

      expect(question.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ tags: [] }),
      }));
    });
  });

  it('marks a page FAILED and continues the batch when extraction throws', async () => {
    documentPage.findMany.mockResolvedValue([
      { id: 'page-1', pageNumber: 1, nativeText: 'text', pageImagePath: '/p1.png', processedImagePath: null, layoutData: null },
    ]);
    getPageRawText.mockRejectedValue(new Error('OCR provider timed out'));

    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(question.create).not.toHaveBeenCalled();
    expect(documentPage.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'page-1' }, data: expect.objectContaining({ status: 'FAILED' }) }));
    expect(data.batch.failures).toEqual(['Page 1: OCR provider timed out']);
  });

  it('reports completion with no work left when every rendered page is already extracted', async () => {
    documentPage.findMany.mockResolvedValue([]);
    documentPage.count.mockReset();
    documentPage.count.mockResolvedValue(0); // unrendered + failedRemaining counts
    documentPage.findFirst.mockResolvedValue(null); // no earlier FAILED page

    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    const data = await response.json();

    expect(data.complete).toBe(true);
    expect(data.nextStartPage).toBeNull();
    // The only write on the "genuinely done" path is resetting the failed-retry
    // cycle counter — never the full IN_PROGRESS extraction-progress update.
    expect(bookIngestionRun.update).toHaveBeenCalledTimes(1);
    expect(bookIngestionRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { providerConfig: expect.objectContaining({ failureRetryCycles: 0 }) },
    }));
  });

  describe('case-study page stitching', () => {
    it('holds a passage-only page and stitches it onto the next page to save one combined question', async () => {
      documentPage.findMany.mockResolvedValue([
        { id: 'page-24', pageNumber: 24, nativeText: null, pageImagePath: '/p24.png', processedImagePath: null, layoutData: { requiresVisionSegmentation: true } },
        { id: 'page-25', pageNumber: 25, nativeText: null, pageImagePath: '/p25.png', processedImagePath: null, layoutData: { requiresVisionSegmentation: true } },
      ]);
      getPageRawText
        .mockResolvedValueOnce({ provider: 'MATHPIX_OCR', rawText: CASE_STUDY_PASSAGE, ocrConfidence: 0.9 })
        .mockResolvedValueOnce({ provider: 'MATHPIX_OCR', rawText: CASE_STUDY_SUBQUESTIONS, ocrConfidence: 0.92 });
      structurePageQuestions
        .mockResolvedValueOnce([]) // page 24 alone: nothing to segment yet -> fragment
        .mockResolvedValueOnce([{ question: { questionContent: `${CASE_STUDY_PASSAGE}\n\n${CASE_STUDY_SUBQUESTIONS}`, type: 'CASE_STUDY', difficulty: 'MEDIUM', options: [], correctAnswer: '', explanation: 'combined solution', tags: [], topic: 'Relations and Functions', method: '', printedNumber: '', explanationType: 'FULL' }, contentHash: 'hash-cs', qaIssues: [] }]);

      const { POST } = await import('./route');
      const response = (await POST(post({ startPage: 24, batchSize: 5 }), { params })) as Response;
      const data = await response.json();

      expect(response.status).toBe(200);
      // structurePageQuestions' second call must have seen page 24's passage prepended.
      expect(structurePageQuestions).toHaveBeenNthCalledWith(2, `${CASE_STUDY_PASSAGE}\n\n${CASE_STUDY_SUBQUESTIONS}`);
      expect(question.create).toHaveBeenCalledTimes(1);
      expect(question.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ contentHash: 'hash-cs', sourcePageStart: 24, sourcePageEnd: 25 }),
      }));
      expect(documentPage.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'page-24' }, data: expect.objectContaining({ status: 'COMPLETED', detectedQuestions: 0 }) }));
      expect(documentPage.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'page-25' }, data: expect.objectContaining({ status: 'COMPLETED', detectedQuestions: 1 }) }));
      expect(data.batch.saved).toBe(1);
      // The fragment resolved within this batch -> nothing left pending.
      expect(bookIngestionRun.update).toHaveBeenLastCalledWith(expect.objectContaining({
        data: expect.objectContaining({ providerConfig: expect.objectContaining({ pendingCaseStudyFragment: null }) }),
      }));
    });

    it('persists a pending fragment across batches and picks it up on the next call', async () => {
      documentPage.findMany.mockResolvedValue([
        { id: 'page-24', pageNumber: 24, nativeText: null, pageImagePath: '/p24.png', processedImagePath: null, layoutData: { requiresVisionSegmentation: true } },
      ]);
      getPageRawText.mockResolvedValueOnce({ provider: 'MATHPIX_OCR', rawText: CASE_STUDY_PASSAGE, ocrConfidence: 0.9 });
      structurePageQuestions.mockResolvedValueOnce([]);

      const { POST } = await import('./route');
      await POST(post({ startPage: 24, batchSize: 1 }), { params });

      expect(question.create).not.toHaveBeenCalled();
      expect(bookIngestionRun.update).toHaveBeenLastCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          providerConfig: expect.objectContaining({
            pendingCaseStudyFragment: expect.objectContaining({ startPage: 24, lastPage: 24, text: CASE_STUDY_PASSAGE, documentPageIds: ['page-24'] }),
          }),
        }),
      }));
    });

    it('resumes a fragment carried over from providerConfig into a fresh request', async () => {
      bookIngestionRun.findFirst.mockResolvedValue({
        id: 'run-1', sourceDocumentId: 'doc-1', totalPages: 2, extractedQuestions: 0, reviewRequired: 0,
        providerConfig: { pendingCaseStudyFragment: { startPage: 24, lastPage: 24, text: CASE_STUDY_PASSAGE, documentPageIds: ['page-24'], chainLength: 1 } },
      });
      documentPage.findMany.mockResolvedValue([
        { id: 'page-25', pageNumber: 25, nativeText: null, pageImagePath: '/p25.png', processedImagePath: null, layoutData: { requiresVisionSegmentation: true } },
      ]);
      getPageRawText.mockResolvedValueOnce({ provider: 'MATHPIX_OCR', rawText: CASE_STUDY_SUBQUESTIONS, ocrConfidence: 0.92 });
      structurePageQuestions.mockResolvedValueOnce([{ question: { questionContent: 'combined', type: 'CASE_STUDY', difficulty: 'MEDIUM', options: [], correctAnswer: '', explanation: 'combined solution', tags: [], topic: '', method: '', printedNumber: '', explanationType: 'FULL' }, contentHash: 'hash-cs', qaIssues: [] }]);

      const { POST } = await import('./route');
      await POST(post({ startPage: 25, batchSize: 5 }), { params });

      expect(structurePageQuestions).toHaveBeenCalledWith(`${CASE_STUDY_PASSAGE}\n\n${CASE_STUDY_SUBQUESTIONS}`);
      expect(question.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ sourcePageStart: 24, sourcePageEnd: 25 }),
      }));
    });

    it('drops a stale pending fragment instead of stitching non-adjacent pages', async () => {
      bookIngestionRun.findFirst.mockResolvedValue({
        id: 'run-1', sourceDocumentId: 'doc-1', totalPages: 2, extractedQuestions: 0, reviewRequired: 0,
        providerConfig: { pendingCaseStudyFragment: { startPage: 24, lastPage: 24, text: CASE_STUDY_PASSAGE, documentPageIds: ['page-24'], chainLength: 1 } },
      });
      // Batch resumes at page 30, not 25 — the run was re-started out of order.
      documentPage.findMany.mockResolvedValue([
        { id: 'page-30', pageNumber: 30, nativeText: 'plain text', pageImagePath: '/p30.png', processedImagePath: null, layoutData: null },
      ]);
      getPageRawText.mockResolvedValueOnce({ provider: 'NATIVE_TEXT', rawText: 'An unrelated question on page 30.', ocrConfidence: null });
      structurePageQuestions.mockResolvedValueOnce([{ question: { questionContent: 'An unrelated question on page 30.', type: 'SUBJECTIVE', difficulty: 'MEDIUM', options: [], correctAnswer: '', explanation: 'ans', tags: [], topic: '', method: '', printedNumber: '', explanationType: 'FULL' }, contentHash: 'hash-30', qaIssues: [] }]);

      const { POST } = await import('./route');
      await POST(post({ startPage: 30, batchSize: 5 }), { params });

      // The stale fragment's text must NOT have been prepended.
      expect(structurePageQuestions).toHaveBeenCalledWith('An unrelated question on page 30.');
      expect(question.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ sourcePageStart: 30, sourcePageEnd: 30 }),
      }));
    });
  });

  describe('diagram image capture', () => {
    it('crops a detected region and attaches it to the single question saved from that page', async () => {
      documentPage.findMany.mockResolvedValue([
        { id: 'page-1', pageNumber: 1, nativeText: null, pageImagePath: '/p1.png', processedImagePath: null, layoutData: { requiresVisionSegmentation: true } },
      ]);
      getPageRawText.mockResolvedValueOnce({
        provider: 'MATHPIX_OCR',
        rawText: 'A triangle is shown below. Find its area.',
        ocrConfidence: 0.91,
        diagramRegions: [{ x: 50, y: 60, width: 300, height: 220, type: 'diagram' }],
        ocrImagePath: '/private/page-1.jpg',
      });
      structurePageQuestions.mockResolvedValueOnce([
        { question: { questionContent: 'Find the area of the triangle shown.', type: 'SUBJECTIVE', difficulty: 'MEDIUM', options: [], correctAnswer: '', explanation: 'Area = 1/2 * base * height', tags: [], topic: '', method: '', printedNumber: '', explanationType: 'FULL' }, contentHash: 'hash-diagram', qaIssues: [] },
      ]);
      question.create.mockResolvedValue({ id: 'q-diagram-1' });

      const { POST } = await import('./route');
      const response = (await POST(post({ startPage: 1, batchSize: 5 }), { params })) as Response;
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(cropPageRegion).toHaveBeenCalledWith('book-1', 'run-1', '/private/page-1.jpg', 'q-diagram-1-0.jpg', { x: 50, y: 60, width: 300, height: 220, type: 'diagram' });
      expect(questionImage.create).toHaveBeenCalledWith({
        data: {
          questionId: 'q-diagram-1',
          imageUrl: '/api/admin/books/book-1/ingestions/run-1/question-images/q-diagram-1-0.jpg',
          imageType: 'diagram',
          orderIndex: 0,
        },
      });
      expect(data.batch.saved).toBe(1);
    });

    it('does not attach a page-level region to any question when the page produced more than one question', async () => {
      documentPage.findMany.mockResolvedValue([
        { id: 'page-1', pageNumber: 1, nativeText: null, pageImagePath: '/p1.png', processedImagePath: null, layoutData: { requiresVisionSegmentation: true } },
      ]);
      getPageRawText.mockResolvedValueOnce({
        provider: 'MATHPIX_OCR',
        rawText: 'Two questions on one page.',
        ocrConfidence: 0.9,
        diagramRegions: [{ x: 10, y: 10, width: 100, height: 100, type: 'diagram' }],
        ocrImagePath: '/private/page-1.jpg',
      });
      structurePageQuestions.mockResolvedValueOnce([
        { question: { questionContent: 'Q1', type: 'SUBJECTIVE', difficulty: 'EASY', options: [], correctAnswer: '', explanation: 'a1', tags: [], topic: '', method: '', printedNumber: '', explanationType: 'FULL' }, contentHash: 'hash-q1', qaIssues: [] },
        { question: { questionContent: 'Q2', type: 'SUBJECTIVE', difficulty: 'EASY', options: [], correctAnswer: '', explanation: 'a2', tags: [], topic: '', method: '', printedNumber: '', explanationType: 'FULL' }, contentHash: 'hash-q2', qaIssues: [] },
      ]);

      const { POST } = await import('./route');
      await POST(post({ startPage: 1, batchSize: 5 }), { params });

      expect(question.create).toHaveBeenCalledTimes(2);
      expect(cropPageRegion).not.toHaveBeenCalled();
      expect(questionImage.create).not.toHaveBeenCalled();
    });

    it('stitches diagram regions from the passage page onto the resolved case-study question', async () => {
      documentPage.findMany.mockResolvedValue([
        { id: 'page-24', pageNumber: 24, nativeText: null, pageImagePath: '/p24.png', processedImagePath: null, layoutData: { requiresVisionSegmentation: true } },
        { id: 'page-25', pageNumber: 25, nativeText: null, pageImagePath: '/p25.png', processedImagePath: null, layoutData: { requiresVisionSegmentation: true } },
      ]);
      getPageRawText
        .mockResolvedValueOnce({ provider: 'MATHPIX_OCR', rawText: CASE_STUDY_PASSAGE, ocrConfidence: 0.9, diagramRegions: [{ x: 20, y: 20, width: 150, height: 150, type: 'chart' }], ocrImagePath: '/private/page-24.jpg' })
        .mockResolvedValueOnce({ provider: 'MATHPIX_OCR', rawText: CASE_STUDY_SUBQUESTIONS, ocrConfidence: 0.92, diagramRegions: [], ocrImagePath: '/private/page-25.jpg' });
      structurePageQuestions
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ question: { questionContent: `${CASE_STUDY_PASSAGE}\n\n${CASE_STUDY_SUBQUESTIONS}`, type: 'CASE_STUDY', difficulty: 'MEDIUM', options: [], correctAnswer: '', explanation: 'combined solution', tags: [], topic: 'Relations and Functions', method: '', printedNumber: '', explanationType: 'FULL' }, contentHash: 'hash-cs-img', qaIssues: [] }]);
      question.create.mockResolvedValue({ id: 'q-cs-1' });

      const { POST } = await import('./route');
      await POST(post({ startPage: 24, batchSize: 5 }), { params });

      // The chart lives on page 24 (the passage page), but must still attach
      // to the single Question row saved once the fragment resolves on page 25.
      expect(cropPageRegion).toHaveBeenCalledWith('book-1', 'run-1', '/private/page-24.jpg', 'q-cs-1-0.jpg', { x: 20, y: 20, width: 150, height: 150, type: 'chart' });
    });

    it('logs and continues when a crop fails, without failing the batch', async () => {
      documentPage.findMany.mockResolvedValue([
        { id: 'page-1', pageNumber: 1, nativeText: null, pageImagePath: '/p1.png', processedImagePath: null, layoutData: { requiresVisionSegmentation: true } },
      ]);
      getPageRawText.mockResolvedValueOnce({
        provider: 'MATHPIX_OCR',
        rawText: 'A figure is shown below.',
        ocrConfidence: 0.9,
        diagramRegions: [{ x: 10, y: 10, width: 100, height: 100, type: 'diagram' }],
        ocrImagePath: '/private/page-1.jpg',
      });
      structurePageQuestions.mockResolvedValueOnce([
        { question: { questionContent: 'Q1', type: 'SUBJECTIVE', difficulty: 'EASY', options: [], correctAnswer: '', explanation: 'a1', tags: [], topic: '', method: '', printedNumber: '', explanationType: 'FULL' }, contentHash: 'hash-q1', qaIssues: [] },
      ]);
      cropPageRegion.mockRejectedValueOnce(new Error('crop script exited with code 1'));

      const { POST } = await import('./route');
      const response = (await POST(post({ startPage: 1, batchSize: 5 }), { params })) as Response;
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(question.create).toHaveBeenCalledTimes(1);
      expect(questionImage.create).not.toHaveBeenCalled();
      expect(data.batch.saved).toBe(1);
      expect(data.batch.failures).toEqual([]);
    });
  });
});
