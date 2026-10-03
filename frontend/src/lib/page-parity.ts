/**
 * "The number of pages extracted should match the original PDF."
 *
 * The PDF's own page count (counted independently from the file during
 * inventory, stored as the run's totalPages) is compared with the pages the
 * pipeline actually holds. A book is only faithful when every number from 1 to
 * N is present with a rendered image -- a page count that merely adds up could
 * hide a gap plus a stray extra page.
 */

export interface PageParity {
  pdfPages: number;
  pagesHeld: number;
  pagesWithImage: number;
  pagesWithText: number;
  missingPages: number[];
  missingImagePages: number[];
  unexpectedPages: number[];
  // True only when every page 1..pdfPages is held with an image and nothing extra exists.
  matches: boolean;
}

export function comparePages(pdfPages: number, rows: Array<{ pageNumber: number; hasImage: boolean; hasText: boolean }>): PageParity {
  const byNumber = new Map(rows.map(row => [row.pageNumber, row]));
  const missingPages: number[] = [];
  const missingImagePages: number[] = [];
  for (let page = 1; page <= pdfPages; page++) {
    const row = byNumber.get(page);
    if (!row) missingPages.push(page);
    else if (!row.hasImage) missingImagePages.push(page);
  }
  const unexpectedPages = rows.filter(row => row.pageNumber < 1 || row.pageNumber > pdfPages).map(row => row.pageNumber).sort((a, b) => a - b);
  return {
    pdfPages,
    pagesHeld: rows.length,
    pagesWithImage: rows.filter(row => row.hasImage).length,
    pagesWithText: rows.filter(row => row.hasText).length,
    missingPages,
    missingImagePages,
    unexpectedPages,
    matches: missingPages.length === 0 && missingImagePages.length === 0 && unexpectedPages.length === 0,
  };
}

/** Compact "12, 13, 20-24" rendering of a page list for messages. */
export function describePageList(pages: number[], limit = 12): string {
  const sorted = [...pages].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    ranges.push(j > i ? `${sorted[i]}–${sorted[j]}` : String(sorted[i]));
    i = j + 1;
  }
  return ranges.length > limit ? `${ranges.slice(0, limit).join(', ')} and ${ranges.length - limit} more` : ranges.join(', ');
}
