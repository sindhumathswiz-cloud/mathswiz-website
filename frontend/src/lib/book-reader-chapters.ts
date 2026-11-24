/** A book's chapter list in the reader. No database here: the reader in the browser uses it too. */

export interface ReaderChapter { id: string; name: string; chapterNumber: string | null; startPage: number }

/**
 * Chapters to jump to, in page order. Rows are kept in the order they were found during extraction, not page order,
 * and a chapter without a first page, or one past the last page, has nowhere to go; the same chapter entered twice
 * is listed once.
 */
export function readerChapters(rows: Array<{ id: string; name: string; chapterNumber: string | null; startPage: number | null }>, pages: number[]): ReaderChapter[] {
  if (!pages.length) return [];
  const first = pages[0];
  const last = pages[pages.length - 1];
  const seen = new Set<string>();
  return rows
    .filter((c): c is typeof c & { startPage: number } => c.startPage != null && c.startPage >= first && c.startPage <= last)
    .sort((a, b) => a.startPage - b.startPage || (a.chapterNumber ?? '').localeCompare(b.chapterNumber ?? '', undefined, { numeric: true }))
    .filter((c) => {
      const key = `${c.startPage}|${c.name.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ id, name, chapterNumber, startPage }) => ({ id, name, chapterNumber, startPage }));
}

/** Which chapter a page falls in: the last one starting at or before it. */
export function chapterAt(chapters: ReaderChapter[], page: number | null): ReaderChapter | null {
  if (page == null) return null;
  let found: ReaderChapter | null = null;
  for (const chapter of chapters) {
    if (chapter.startPage <= page) found = chapter;
    else break;
  }
  return found;
}
