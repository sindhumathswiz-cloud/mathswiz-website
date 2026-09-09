import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { QAIssue } from './question-qa';

// Explicit fetch-mock shape: `vi.fn(async () => ({...}))` alone infers a
// zero-parameter implementation type, which makes `.mock.calls[0]` a `[]`
// tuple and breaks any indexing/destructuring into the call args. Typing
// the mock's call signature here (both args required, since the code under
// test always calls `fetch(url, init)`) fixes that for every test below
// that needs to inspect what was sent to Mathpix.
type MathpixFetchResponse = {
  ok: boolean;
  json: () => Promise<{ text: string; confidence: number | null; line_data?: unknown }>;
};
type MathpixFetch = (input: string, init: RequestInit) => Promise<MathpixFetchResponse>;

const assertPrivatePageImagePath = vi.fn((p: string) => p);
const cleanMathpixMarkdown = vi.fn((text: string) => `CLEANED:${text}`);
const structureQuestions = vi.fn();
const analyzeQuestion = vi.fn<(...args: unknown[]) => QAIssue[]>(() => []);
const computeContentHash = vi.fn((content: string) => `hash:${content}`);
const readFile = vi.fn(async () => Buffer.from('fake-image-bytes'));

vi.mock('./book-storage', () => ({ assertPrivatePageImagePath }));
vi.mock('./mathpix-parser', () => ({ cleanMathpixMarkdown }));
vi.mock('./structure-questions', () => ({ structureQuestions }));
vi.mock('./question-qa', () => ({ analyzeQuestion }));
vi.mock('./question-classifier', () => ({ computeContentHash }));
// Vitest 4 checks a mocked built-in module's shape against the real one —
// node:fs/promises' ESM interop shim exposes a `default` (the same methods
// as one object) alongside the named exports, so the mock needs both or
// Vitest rejects it with "No 'default' export is defined on the mock."
vi.mock('node:fs/promises', () => ({ readFile, default: { readFile } }));

describe('extractQuestionsFromPage', () => {
  const originalFetch = global.fetch;
  const originalMathpixId = process.env.MATHPIX_APP_ID;
  const originalMathpixKey = process.env.MATHPIX_APP_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    structureQuestions.mockResolvedValue([]);
    analyzeQuestion.mockReturnValue([]);
    process.env.MATHPIX_APP_ID = 'app-id';
    process.env.MATHPIX_APP_KEY = 'app-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalMathpixId === undefined) delete process.env.MATHPIX_APP_ID; else process.env.MATHPIX_APP_ID = originalMathpixId;
    if (originalMathpixKey === undefined) delete process.env.MATHPIX_APP_KEY; else process.env.MATHPIX_APP_KEY = originalMathpixKey;
  });

  it('uses the native text layer when it is trustworthy, without calling OCR', async () => {
    const { extractQuestionsFromPage } = await import('./extract-book-page');
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    structureQuestions.mockResolvedValue([{ questionContent: 'Solve for x', type: 'INTEGER', difficulty: 'EASY', options: [], correctAnswer: '5', explanation: 'work', tags: [] }]);

    const result = await extractQuestionsFromPage({
      pageNumber: 1,
      nativeText: 'A '.repeat(30), // well over the min-length threshold
      pageImagePath: '/private/page-1.png',
      processedImagePath: null,
      requiresVisionSegmentation: false,
    });

    expect(result.provider).toBe('NATIVE_TEXT');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
    expect(structureQuestions).toHaveBeenCalledWith(result.rawText, {});
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].contentHash).toBe('hash:Solve for x');
  });

  it('falls back to Mathpix OCR when the layout analyzer flags vision segmentation, even with native text present', async () => {
    const { extractQuestionsFromPage } = await import('./extract-book-page');
    const fetchSpy = vi.fn<MathpixFetch>(async () => ({ ok: true, json: async () => ({ text: 'raw ocr text', confidence: 0.87 }) }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    structureQuestions.mockResolvedValue([]);

    const result = await extractQuestionsFromPage({
      pageNumber: 2,
      nativeText: 'plenty of native text here just in case',
      pageImagePath: '/private/page-2.png',
      processedImagePath: '/private/page-2-processed.png',
      requiresVisionSegmentation: true,
    });

    expect(result.provider).toBe('MATHPIX_OCR');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.mathpix.com/v3/text');
    expect(result.rawText).toBe('CLEANED:raw ocr text');
    expect(result.ocrConfidence).toBe(0.87);
    // Uses the enhanced/processed image over the raw archival one when both exist.
    expect(assertPrivatePageImagePath).toHaveBeenCalledWith('/private/page-2-processed.png');
    // No line_data in this mocked response -> no diagram regions, but the OCR
    // image path is still surfaced (needed even when a page has zero regions,
    // since a case-study stitch spanning this page still wants to know it was
    // OCR'd).
    expect(result.diagramRegions).toEqual([]);
    expect(result.ocrImagePath).toBe('/private/page-2-processed.png');
  });

  it('requests Mathpix line data and parses returned diagram regions', async () => {
    const { extractQuestionsFromPage } = await import('./extract-book-page');
    const fetchSpy = vi.fn<MathpixFetch>(async () => ({
      ok: true,
      json: async () => ({
        text: 'raw ocr text',
        confidence: 0.9,
        line_data: [{ type: 'diagram', cnt: [[10, 10], [210, 10], [210, 210], [10, 210]] }],
      }),
    }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    structureQuestions.mockResolvedValue([]);

    const result = await extractQuestionsFromPage({
      pageNumber: 7,
      nativeText: '',
      pageImagePath: '/private/page-7.png',
      processedImagePath: null,
      requiresVisionSegmentation: true,
    });

    const [, requestInit] = fetchSpy.mock.calls[0];
    const sentOptions = JSON.parse((requestInit.body as FormData).get('options_json') as string);
    // include_line_data is a TOP-LEVEL Mathpix request field — nesting it under
    // data_options makes the real API reject it as an unknown key (see the impl).
    expect(sentOptions.include_line_data).toBe(true);
    expect(sentOptions.data_options).toBeUndefined();
    expect(result.diagramRegions).toEqual([{ x: 10, y: 10, width: 200, height: 200, type: 'diagram' }]);
  });

  it('never OCRs (and reports no diagram regions or OCR image) when the native text layer is trusted', async () => {
    const { extractQuestionsFromPage } = await import('./extract-book-page');
    structureQuestions.mockResolvedValue([]);

    const result = await extractQuestionsFromPage({
      pageNumber: 8,
      nativeText: 'A '.repeat(30),
      pageImagePath: '/private/page-8.png',
      processedImagePath: null,
      requiresVisionSegmentation: false,
    });

    expect(result.diagramRegions).toEqual([]);
    expect(result.ocrImagePath).toBeNull();
  });

  it('falls back to OCR when native text is too short to trust', async () => {
    const { extractQuestionsFromPage } = await import('./extract-book-page');
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ text: 'short page ocr', confidence: null }) })) as unknown as typeof fetch;

    const result = await extractQuestionsFromPage({
      pageNumber: 3,
      nativeText: 'too short',
      pageImagePath: '/private/page-3.png',
      processedImagePath: null,
      requiresVisionSegmentation: false,
    });

    expect(result.provider).toBe('MATHPIX_OCR');
    expect(result.ocrConfidence).toBeNull();
  });

  it('returns no questions and never calls OCR when there is neither usable text nor an image', async () => {
    const { extractQuestionsFromPage } = await import('./extract-book-page');
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await extractQuestionsFromPage({
      pageNumber: 4,
      nativeText: '',
      pageImagePath: null,
      processedImagePath: null,
      requiresVisionSegmentation: false,
    });

    expect(result.questions).toEqual([]);
    expect(result.rawText).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(structureQuestions).not.toHaveBeenCalled();
  });

  it('throws a clear error when Mathpix credentials are missing but OCR is required', async () => {
    delete process.env.MATHPIX_APP_ID;
    delete process.env.MATHPIX_APP_KEY;
    const { extractQuestionsFromPage } = await import('./extract-book-page');

    await expect(extractQuestionsFromPage({
      pageNumber: 5,
      nativeText: '',
      pageImagePath: '/private/page-5.png',
      processedImagePath: null,
      requiresVisionSegmentation: true,
    })).rejects.toThrow(/Mathpix credentials/);
  });

  it('attaches QA issues and a content hash to every extracted question', async () => {
    const { extractQuestionsFromPage } = await import('./extract-book-page');
    global.fetch = vi.fn() as unknown as typeof fetch;
    structureQuestions.mockResolvedValue([
      { questionContent: 'Q1', type: 'SUBJECTIVE', difficulty: 'MEDIUM', options: [], correctAnswer: '', explanation: '', tags: [] },
    ]);
    analyzeQuestion.mockReturnValue([{ severity: 'warn', code: 'MISSING_EXPLANATION', message: 'No explanation / solution provided' }]);

    const result = await extractQuestionsFromPage({
      pageNumber: 6,
      nativeText: 'A '.repeat(30),
      pageImagePath: '/private/page-6.png',
      processedImagePath: null,
      requiresVisionSegmentation: false,
    });

    expect(result.questions[0].qaIssues).toEqual([{ severity: 'warn', code: 'MISSING_EXPLANATION', message: 'No explanation / solution provided' }]);
    expect(analyzeQuestion).toHaveBeenCalledWith({ content: 'Q1', options: [], correctAnswer: '', explanation: '', type: 'SUBJECTIVE' });
  });
});
