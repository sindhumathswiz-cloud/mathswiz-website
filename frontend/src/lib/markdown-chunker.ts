/**
 * Splits a large Mathpix markdown document into overlapping, paragraph-aligned
 * chunks for LLM structuring. Chunking on blank-line boundaries avoids cutting a
 * question mid-way; the small block overlap keeps a question and its solution
 * together when they straddle a chunk boundary (duplicates are removed later via
 * dedupeByContent).
 */
export function chunkMarkdown(md: string, targetChars = 6000, overlapBlocks = 1): string[] {
  if (!md || !md.trim()) return [];
  const blocks = md.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length === 0) return [];

  const chunks: string[] = [];
  let current: string[] = [];
  let size = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push(current.join('\n\n'));
    // Carry the last `overlapBlocks` blocks into the next chunk for continuity.
    const carry = overlapBlocks > 0 ? current.slice(-overlapBlocks) : [];
    current = [...carry];
    size = carry.reduce((n, b) => n + b.length + 2, 0);
  };

  for (const block of blocks) {
    // A single oversized block becomes its own chunk.
    if (block.length >= targetChars) {
      flush();
      chunks.push(block);
      current = [];
      size = 0;
      continue;
    }
    if (size + block.length > targetChars && current.length > 0) flush();
    current.push(block);
    size += block.length + 2;
  }
  flush();

  return chunks;
}
