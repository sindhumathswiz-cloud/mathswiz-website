import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFromLLM } from "./llm";

describe("LLM provider fallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses Groq without JSON mode for student-facing hints", async () => {
    vi.stubEnv("GROQ_API_KEY", "groq-test-key");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY_1", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY_1", "");
    vi.stubEnv("GEMINI_API_KEY_2", "");
    vi.stubEnv("GEMINI_API_KEY_3", "");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "Try isolating the variable first." } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchFromLLM("Tutor", "Give a hint", { json: false }))
      .resolves.toBe("Try isolating the variable first.");

    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.response_format).toBeUndefined();
  });

  it("requests structured JSON by default for verification workflows", async () => {
    vi.stubEnv("GROQ_API_KEY", "groq-test-key");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY_1", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY_1", "");
    vi.stubEnv("GEMINI_API_KEY_2", "");
    vi.stubEnv("GEMINI_API_KEY_3", "");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"isCorrect":true}' } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchFromLLM("Verifier", "Check this");

    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.response_format).toEqual({ type: "json_object" });
  });

  // Regression coverage for a real incident: llama-3.3-70b-versatile,
  // llama-3.1-8b-instant and gemini-2.0-flash were all retired by their
  // providers (404 "model not found" / "no longer available") without any
  // code change here, silently taking verify-mathematics's success rate to
  // 0% -- invisible because its own catch block swallowed the error with no
  // logging. Pins the model names actually in the request so a future
  // provider retirement fails a test instead of failing silently in prod.
  it("requests a currently-supported Groq model", async () => {
    vi.stubEnv("GROQ_API_KEY", "groq-test-key");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY_1", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY_1", "");
    vi.stubEnv("GEMINI_API_KEY_2", "");
    vi.stubEnv("GEMINI_API_KEY_3", "");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"verdict":"verified"}' } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchFromLLM("Verifier", "Check this");

    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.model).toBe("openai/gpt-oss-120b");
    expect(request.model).not.toMatch(/^llama-3\.[13]/);
  });

  it("falls back to a second Gemini model when the first returns 404 (retired)", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY_1", "");
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    vi.stubEnv("GEMINI_API_KEY_1", "");
    vi.stubEnv("GEMINI_API_KEY_2", "");
    vi.stubEnv("GEMINI_API_KEY_3", "");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'no longer available' } }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"verdict":"verified"}' }] } }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchFromLLM("Verifier", "Check this")).resolves.toBe('{"verdict":"verified"}');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = fetchMock.mock.calls[0][0] as string;
    const secondUrl = fetchMock.mock.calls[1][0] as string;
    expect(firstUrl).not.toContain("gemini-2.0-flash");
    expect(firstUrl).not.toBe(secondUrl);
  });

  it("never used to attempt gemini-2.0-flash (retired) or the old Groq llama models", { timeout: 30000 }, async () => {
    // Every call 404s, so fetchFromLLM exhausts its full retry/backoff
    // budget across all three providers before giving up -- needs more than
    // vitest's 5s default.
    vi.stubEnv("GROQ_API_KEY", "groq-test-key");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY_1", "");
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    vi.stubEnv("GEMINI_API_KEY_1", "");
    vi.stubEnv("GEMINI_API_KEY_2", "");
    vi.stubEnv("GEMINI_API_KEY_3", "");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'model not found' },
    }), { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchFromLLM("Verifier", "Check this")).rejects.toThrow();

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    const bodies = fetchMock.mock.calls
      .map((c) => c[1]?.body)
      .filter(Boolean)
      .map((b) => JSON.parse(b as string));
    expect(urls.some((u) => u.includes("gemini-2.0-flash"))).toBe(false);
    expect(bodies.some((b) => b.model === "llama-3.3-70b-versatile" || b.model === "llama-3.1-8b-instant")).toBe(false);
  });
});
