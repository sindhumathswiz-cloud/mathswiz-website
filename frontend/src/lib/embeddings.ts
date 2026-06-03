function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ].filter(Boolean) as string[];

  if (apiKeys.length === 0) {
    throw new Error("No Gemini API key configured for embeddings");
  }

  const key = apiKeys[Math.floor(Math.random() * apiKeys.length)];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text: text.substring(0, 8000) }] },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini embedding error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.embedding.values;
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await generateEmbedding(text));
  }
  return results;
}
