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
});
