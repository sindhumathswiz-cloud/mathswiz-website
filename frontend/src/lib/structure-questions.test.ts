import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// callGemini goes through the @google/generative-ai SDK; callGroq and
// callMistral both use raw fetch. Mocking both surfaces lets each test drive
// exactly which provider succeeds/fails/returns garbage.
const mockGenerateContent = vi.fn();
vi.mock('@google/generative-ai', () => ({
  // Must be constructable (`new GoogleGenerativeAI(key)` in callGemini), so the
  // implementation has to be a `function`/`class` -- an arrow function throws
  // "is not a constructor" when invoked with `new`.
  GoogleGenerativeAI: vi.fn().mockImplementation(function GoogleGenerativeAI() {
    return {
      getGenerativeModel: () => ({ generateContent: mockGenerateContent }),
    };
  }),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function geminiOk(text: string) {
  mockGenerateContent.mockResolvedValueOnce({ response: { text: () => text } });
}

function geminiThrows(message = 'Gemini network error') {
  // callGemini retries across GEMINI_MODELS internally (2 models x however
  // many keys are configured) before giving up, so the rejection must
  // persist across however many internal attempts that loop makes --
  // mockRejectedValueOnce would leave the second internal attempt resolving
  // to `undefined` instead, which is not what "Gemini is down" means here.
  mockGenerateContent.mockRejectedValue(new Error(message));
}

// Groq is always the 2nd fetch call attempted, Mistral the 3rd -- but since
// each test controls exactly which providers are reached, mockFetch is just
// queued in call order via mockResolvedValueOnce/mockRejectedValueOnce.
function fetchOk(content: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
}

function fetchHttpError(status = 500, message = 'server error') {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: message,
    json: async () => ({ error: { message } }),
  });
}

const VALID_ONE_QUESTION = JSON.stringify({
  questions: [{
    type: 'INTEGER', difficulty: 'EASY', content: 'What is $2+2$?', options: [],
    correctAnswer: '4', explanation: '', explanationType: 'NONE', topic: 'Algebra',
    method: '', tags: [], printedNumber: '1',
  }],
});

const VALID_EMPTY = JSON.stringify({ questions: [] });

describe('structureQuestions', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'gemini-key';
    process.env.GROQ_API_KEY = 'groq-key';
    process.env.MISTRAL_API_KEY = 'mistral-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns [] immediately for blank input without calling any provider', async () => {
    const { structureQuestions } = await import('./structure-questions');
    const result = await structureQuestions('   ');
    expect(result).toEqual([]);
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses Gemini alone when it returns valid JSON, never touching Groq or Mistral, and keeps its correctAnswer as-is', async () => {
    geminiOk(VALID_ONE_QUESTION);
    const { structureQuestions } = await import('./structure-questions');
    const result = await structureQuestions('page text');
    expect(result).toHaveLength(1);
    expect(result[0].questionContent).toContain('2+2');
    // Gemini is the only provider trusted to have actually read an answer
    // off the page rather than solved it -- its correctAnswer is kept.
    expect(result[0].correctAnswer).toBe('4');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('trusts a valid-but-empty Gemini response as a real "no questions here" signal, without falling back', async () => {
    geminiOk(VALID_EMPTY);
    const { structureQuestions } = await import('./structure-questions');
    const result = await structureQuestions('a page with only a chapter title, no questions');
    expect(result).toEqual([]);
    // The whole point of the fix: a page that legitimately has zero
    // questions must not burn two more provider calls confirming that.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('with { distrustEmpty: true }, keeps going past a parseable-but-empty Gemini result (the p.479 case)', async () => {
    geminiOk(VALID_EMPTY);            // Gemini: confidently empty
    fetchOk(VALID_ONE_QUESTION);      // Groq: actually finds the question
    const { structureQuestions } = await import('./structure-questions');
    const result = await structureQuestions('a page a confirmed manifest says HAS questions', { distrustEmpty: true });
    expect(result).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Still a fallback provider -> its answer is stripped.
    expect(result[0].correctAnswer).toBe('');
  });

  it('with { distrustEmpty: true }, throws if EVERY provider returns empty', async () => {
    geminiOk(VALID_EMPTY);
    fetchOk(VALID_EMPTY);
    fetchOk(VALID_EMPTY);
    const { structureQuestions } = await import('./structure-questions');
    await expect(structureQuestions('page text', { distrustEmpty: true })).rejects.toThrow(/parseable but EMPTY/);
  });

  it('falls back to Groq when Gemini throws (the original, obvious failure mode), but strips its correctAnswer/explanation as unverified', async () => {
    geminiThrows();
    fetchOk(VALID_ONE_QUESTION); // Groq
    const { structureQuestions } = await import('./structure-questions');
    const result = await structureQuestions('page text');
    expect(result).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result[0].correctAnswer).toBe('');
    expect(result[0].explanation).toBe('');
    expect(result[0].explanationType).toBe('NONE');
    // The recovered question TEXT itself is still kept -- only the
    // unverifiable answer/explanation is stripped.
    expect(result[0].questionContent).toContain('2+2');
  });

  it('regression: falls back to Groq when Gemini returns HTTP-200-but-unparseable JSON (truncated mid-array), instead of silently treating it as zero questions', async () => {
    // Modeled on the real failure found on a dense 20-item MCQ page: Gemini
    // answers successfully but the JSON is cut off mid-object, so it fails
    // parseLLMJson even after repair.
    geminiOk('{"questions": [{"type": "SINGLE_CHOICE", "content": "truncated mid');
    fetchOk(VALID_ONE_QUESTION); // Groq recovers it
    const { structureQuestions } = await import('./structure-questions');
    const result = await structureQuestions('a dense page Gemini choked on');
    expect(result).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('regression: strips correctAnswer/explanation from a fallback provider even when they look plausible, and flags the row for review', async () => {
    // Modeled on a real incident: after the fallback chain was added, a
    // dense MCQ page with NO visible answer key or solutions on it (the
    // real key was printed on a different page entirely) came back from a
    // fallback provider with a confident correctAnswer on every question --
    // and several were flatly wrong against the book's actual key found
    // separately. The provider solved the questions itself despite the
    // prompt's explicit "NEVER guess or solve to fabricate one" rule.
    // Because there is no way to tell a genuinely-transcribed answer from a
    // solved one just by looking at the JSON, EVERY fallback-provider
    // answer/explanation must be treated as unverified, not just the ones
    // that happen to look wrong.
    geminiThrows();
    fetchOk(VALID_ONE_QUESTION); // Groq -- claims correctAnswer "4"
    const { structureQuestions } = await import('./structure-questions');
    const result = await structureQuestions('a page with no visible answer key at all');
    expect(result[0].correctAnswer).toBe('');
    expect(result[0].explanation).toBe('');
    expect(result[0].tags.some((t) => t.includes('fallback') && t.includes('unverified'))).toBe(true);
  });

  it('falls all the way to Mistral when both Gemini and Groq fail, and strips Mistral\'s correctAnswer/explanation too', async () => {
    geminiThrows();
    fetchHttpError(429, 'rate limited'); // Groq
    fetchOk(VALID_ONE_QUESTION); // Mistral
    const { structureQuestions } = await import('./structure-questions');
    const result = await structureQuestions('page text');
    expect(result).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Second fetch call must be Mistral's endpoint.
    expect(mockFetch.mock.calls[1][0]).toBe('https://api.mistral.ai/v1/chat/completions');
    expect(result[0].correctAnswer).toBe('');
    expect(result[0].tags.some((t) => t.includes('mistral'))).toBe(true);
  });

  it('regression: falls all the way to Mistral when Gemini and Groq both return unparseable JSON', async () => {
    geminiOk('not json at all, just prose the model wrote instead of the schema');
    fetchOk('also not valid json {{{'); // Groq -- unparseable
    fetchOk(VALID_ONE_QUESTION); // Mistral -- recovers it
    const { structureQuestions } = await import('./structure-questions');
    const result = await structureQuestions('a page that consistently came back empty in production');
    expect(result).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws (rather than silently returning []) once every provider has failed or returned unparseable JSON, so the page surfaces as a real failure instead of looking like a genuine zero-question page', async () => {
    // Found live: 3 pages that clearly had substantial, legible question
    // text (confirmed by reading their raw OCR'd text directly) still came
    // back with 0 detected questions after Gemini, Groq AND Mistral all ran
    // -- with the old silent-[] behavior this was indistinguishable from a
    // genuinely empty page, so nobody could tell it needed investigating.
    // Throwing here means extract-questions/route.ts records it into the
    // batch's failures[] array instead.
    geminiThrows('gemini down');
    fetchHttpError(500, 'groq down'); // Groq
    fetchHttpError(500, 'mistral down'); // Mistral
    const { structureQuestions } = await import('./structure-questions');
    await expect(structureQuestions('page text')).rejects.toThrow(/all 3 providers failed/);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('the thrown all-providers-failed error names each provider and why it failed, for diagnosing exactly this kind of stuck page', async () => {
    geminiThrows('gemini timed out');
    fetchHttpError(500, 'groq is down');
    fetchOk('not valid json from mistral {{{');
    const { structureQuestions } = await import('./structure-questions');
    await expect(structureQuestions('page text')).rejects.toThrow(/gemini threw: gemini timed out/);
  });

  it('still throws (not returns []) when MISTRAL_API_KEY is not configured and the other two providers also failed', async () => {
    delete process.env.MISTRAL_API_KEY;
    geminiThrows();
    fetchHttpError(500, 'groq down'); // Groq
    const { structureQuestions } = await import('./structure-questions');
    await expect(structureQuestions('page text')).rejects.toThrow(/all 3 providers failed/);
    // Only Groq's fetch call happens -- Mistral's call() throws synchronously
    // on the missing key before ever reaching fetch.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('sends the Mistral request with the expected shape (json_object response format, temperature 0)', async () => {
    geminiThrows();
    fetchHttpError(500, 'groq down');
    fetchOk(VALID_ONE_QUESTION);
    const { structureQuestions } = await import('./structure-questions');
    await structureQuestions('page text');
    const [url, init] = mockFetch.mock.calls[1];
    expect(url).toBe('https://api.mistral.ai/v1/chat/completions');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.temperature).toBe(0);
    expect(body.model).toBe('mistral-large-latest');
    expect((init as RequestInit & { headers: Record<string, string> }).headers.Authorization).toBe('Bearer mistral-key');
  });
});
