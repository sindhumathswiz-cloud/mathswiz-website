const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

interface ProviderEntry {
  key: string;
  provider: 'openai' | 'gemini' | 'openrouter' | 'groq' | 'together';
}

export async function fetchFromLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const allKeys: ProviderEntry[] = [
    ...(process.env.GROQ_API_KEY ? [{ key: process.env.GROQ_API_KEY, provider: 'groq' as const }] : []),
    ...(process.env.OPENAI_API_KEY ? [{ key: process.env.OPENAI_API_KEY, provider: 'openai' as const }] : []),
    ...(process.env.OPENAI_API_KEY_1 ? [{ key: process.env.OPENAI_API_KEY_1, provider: 'openai' as const }] : []),
    ...(process.env.GEMINI_API_KEY ? [{ key: process.env.GEMINI_API_KEY, provider: 'gemini' as const }] : []),
    ...(process.env.GEMINI_API_KEY_1 ? [{ key: process.env.GEMINI_API_KEY_1, provider: 'gemini' as const }] : []),
    ...(process.env.GEMINI_API_KEY_2 ? [{ key: process.env.GEMINI_API_KEY_2, provider: 'gemini' as const }] : []),
    ...(process.env.GEMINI_API_KEY_3 ? [{ key: process.env.GEMINI_API_KEY_3, provider: 'gemini' as const }] : []),
    ...(process.env.OPENROUTER_API_KEY ? [{ key: process.env.OPENROUTER_API_KEY, provider: 'openrouter' as const }] : []),
    // Together keys currently invalid (402/401), removed until refreshed
  ].filter(k => k.key);

  if (allKeys.length === 0) throw new Error("No LLM API keys configured");

  // DEBUG: Log which keys are loaded
  console.log("[LLM] Loaded providers:", allKeys.map(k => `${k.provider}:${k.key.substring(0, 10)}...`).join(", "));

  // Priority: OpenRouter (free models, zero cost) → Groq → Gemini → OpenAI
  const priority: Record<string, number> = { openrouter: 0, groq: 1, gemini: 2, openai: 3 };
  const sorted = allKeys.sort((a, b) => (priority[a.provider] ?? 9) - (priority[b.provider] ?? 9));
  const errors: string[] = [];

  for (const { key: apiKey, provider } of sorted) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(2000 * attempt);
      try {
        let result: string | null = null;

        if (provider === 'groq') {
          groqModels: for (const model of GROQ_MODELS) {
            for (const useJsonMode of [true, false]) {
              const body: any = {
                model,
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
                max_tokens: 32768,
              };
              if (useJsonMode) body.response_format = { type: "json_object" };
              const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify(body),
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
          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
              response_format: { type: "json_object" },
              max_tokens: 16384,
            }),
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
              generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192 },
            }),
          });
          if (res.status === 429) { const b = await res.text().catch(() => ''); errors.push(`Gemini 429: ${b.substring(0, 200)}`); continue; }
          if (!res.ok) { const b = await res.text().catch(() => ''); errors.push(`Gemini ${res.status}: ${b.substring(0, 200)}`); continue; }
          const data = await res.json();
          result = data.candidates[0].content.parts[0].text;
          if (result) return result;
        }

        if (provider === 'openrouter') {
          const freeModels = [
            "qwen/qwen3-next-80b-a3b-instruct:free",
            "google/gemma-4-31b-it:free",
            "deepseek/deepseek-v4-flash:free",
          ];
          for (const model of freeModels) {
            const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model,
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
                max_tokens: 16384,
              }),
            });
            if (res.status === 429 || res.status === 413) { errors.push(`OpenRouter/${model} 429`); continue; }
            if (!res.ok) { const b = await res.text().catch(() => ''); errors.push(`OpenRouter/${model} ${res.status}: ${b.substring(0, 200)}`); continue; }
            const data = await res.json();
            result = data.choices[0].message.content;
            if (result) break;
          }
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
