const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

interface ProviderEntry {
  key: string;
  provider: 'openai' | 'gemini' | 'groq';
}

export async function fetchFromLLM(
  systemPrompt: string,
  userPrompt: string,
  options: { json?: boolean; maxTokens?: number } = { json: true },
): Promise<string> {
  const allKeys: ProviderEntry[] = [
    ...(process.env.GROQ_API_KEY ? [{ key: process.env.GROQ_API_KEY, provider: 'groq' as const }] : []),
    ...(process.env.OPENAI_API_KEY ? [{ key: process.env.OPENAI_API_KEY, provider: 'openai' as const }] : []),
    ...(process.env.OPENAI_API_KEY_1 ? [{ key: process.env.OPENAI_API_KEY_1, provider: 'openai' as const }] : []),
    ...(process.env.GEMINI_API_KEY ? [{ key: process.env.GEMINI_API_KEY, provider: 'gemini' as const }] : []),
    ...(process.env.GEMINI_API_KEY_1 ? [{ key: process.env.GEMINI_API_KEY_1, provider: 'gemini' as const }] : []),
    ...(process.env.GEMINI_API_KEY_2 ? [{ key: process.env.GEMINI_API_KEY_2, provider: 'gemini' as const }] : []),
    ...(process.env.GEMINI_API_KEY_3 ? [{ key: process.env.GEMINI_API_KEY_3, provider: 'gemini' as const }] : []),
  ].filter(k => k.key);

  if (allKeys.length === 0) throw new Error("No LLM API keys configured");

  // DEBUG: Log which keys are loaded
  // Priority: OpenRouter (free models, zero cost) → Groq → Gemini → OpenAI
  const priority: Record<string, number> = { groq: 0, gemini: 1, openai: 2 };
  const sorted = allKeys.sort((a, b) => (priority[a.provider] ?? 9) - (priority[b.provider] ?? 9));
  const errors: string[] = [];

  for (const { key: apiKey, provider } of sorted) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(2000 * attempt);
      try {
        let result: string | null = null;

        if (provider === 'groq') {
          groqModels: for (const model of GROQ_MODELS) {
            for (const useJsonMode of options.json === false ? [false] : [true, false]) {
              const body: any = {
                model,
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
                max_tokens: options.maxTokens ?? 32768,
              };
              if (useJsonMode) body.response_format = { type: "json_object" };
              const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(30_000),
              });
              if (res.status === 413) { errors.push(`Groq/${model} 413`); break groqModels; }
              if (res.status === 429) { errors.push(`Groq/${model} 429`); continue; }
              if (!res.ok) { const b = await res.text().catch(() => ''); errors.push(`Groq/${model} ${useJsonMode ? '(json)' : '(plain)'} ${res.status}: ${b.substring(0, 200)}`); continue; }
              const data = await res.json();
              result = data.choices[0].message.content;
              if (result) break;
            }
            if (result) break;
          }
          if (result) return result;
        }

        // Together provider removed — both API keys are invalid/out of credits

        if (provider === 'openai') {
          const body: Record<string, unknown> = {
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
            max_tokens: options.maxTokens ?? 16384,
          };
          if (options.json !== false) body.response_format = { type: "json_object" };
          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
          });
          if (res.status === 429 || res.status === 413) { errors.push(`OpenAI ${res.status}`); continue; }
          if (!res.ok) { const b = await res.text().catch(() => ''); errors.push(`OpenAI ${res.status}: ${b.substring(0, 200)}`); continue; }
          const data = await res.json();
          result = data.choices[0].message.content;
          if (result) return result;
        }

        if (provider === 'gemini') {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ parts: [{ text: userPrompt }] }],
              generationConfig: {
                ...(options.json === false ? {} : { responseMimeType: "application/json" }),
                maxOutputTokens: options.maxTokens ?? 8192,
              },
            }),
            signal: AbortSignal.timeout(30_000),
          });
          if (res.status === 429) { const b = await res.text().catch(() => ''); errors.push(`Gemini 429: ${b.substring(0, 200)}`); continue; }
          if (!res.ok) { const b = await res.text().catch(() => ''); errors.push(`Gemini ${res.status}: ${b.substring(0, 200)}`); continue; }
          const data = await res.json();
          result = data.candidates[0].content.parts[0].text;
          if (result) return result;
        }

        if (result) return result;
      } catch (e: any) {
        errors.push(`${provider}: ${e.message}`);
        continue;
      }
    }
  }

  const errorReport = [...new Set(errors)].join(' | ');
  throw new Error(`All LLM providers failed. Errors: ${errorReport}`);
}
