const CHUNK_MAX_TOKENS = 500;
const CHUNK_OVERLAP_TOKENS = 50;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function splitIntoChunks(text: string, maxTokens = CHUNK_MAX_TOKENS, overlapTokens = CHUNK_OVERLAP_TOKENS): { content: string; index: number }[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: { content: string; index: number }[] = [];
  let currentChunk = '';
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const chunkTokens = estimateTokens(currentChunk);
    const paraTokens = estimateTokens(trimmed);

    if (chunkTokens + paraTokens > maxTokens && currentChunk) {
      chunks.push({ content: currentChunk.trim(), index: chunkIndex++ });

      // Start new chunk with overlap from previous
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(overlapTokens * 4));
      currentChunk = overlapWords.join(' ') + '\n\n' + trimmed;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({ content: currentChunk.trim(), index: chunkIndex });
  }

  return chunks;
}

export function extractTags(text: string): string[] {
  const tags: string[] = [];
  const patterns = [
    /\[(CBSE|ICSE|IB|IGCSE|STATE)\s*\d*\]/gi,
    /\[(NCERT|EXEMPLAR|PYQ|DPP|COMPETENCY)\]/gi,
    /(?:^|\n)#(\w+)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      tags.push(match[1].toUpperCase());
    }
  }
  return [...new Set(tags)];
}
