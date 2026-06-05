/**
 * Helpers for structuring a multi-page document in overlapping windows instead
 * of page-by-page. Per-page structuring can't pair a question with a solution
 * that spills onto the next page (they land in different LLM calls). Overlapping
 * windows keep adjacent pages together; the overlap is then de-duplicated.
 */

export interface PageWindow {
  startPage: number; // 1-based, inclusive
  endPage: number;   // 1-based, inclusive
  text: string;      // concatenated page texts with [Page N] markers
}

/**
 * Group page texts into overlapping windows.
 * @param size    pages per window (default 4)
 * @param overlap pages shared with the previous window (default 1)
 */
export function buildPageWindows(pages: string[], size = 4, overlap = 1): PageWindow[] {
  const out: PageWindow[] = [];
  if (pages.length === 0) return out;
  const w = Math.max(1, size);
  const ov = Math.min(Math.max(0, overlap), w - 1);
  const step = w - ov;

  for (let start = 0; start < pages.length; start += step) {
    const end = Math.min(start + w, pages.length);
    const text = pages
      .slice(start, end)
      .map((t, i) => `[Page ${start + i + 1}]\n${t ?? ''}`)
      .join('\n\n');
    out.push({ startPage: start + 1, endPage: end, text });
    if (end >= pages.length) break;
  }
  return out;
}

/** Normalize question content for cross-window duplicate detection. */
export function dedupKey(content: string): string {
  return (content || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Drop questions whose normalized content was already seen — removes the
 * duplicates introduced by overlapping windows while preserving order.
 */
export function dedupeByContent<T extends { content?: string; questionContent?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = dedupKey(item.content ?? item.questionContent ?? '');
    if (!key) { out.push(item); continue; } // keep keyless (manual) items
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
