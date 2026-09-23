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

  // text-embedding-004 was retired by Google; gemini-embedding-001 is its
  // replacement. It defaults to 3072 dimensions, so outputDimensionality is
  // pinned to 1536 to match the DocumentChunk.embedding vector(1536) column.
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text: text.substring(0, 8000) }] },
        outputDimensionality: 1536,
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
