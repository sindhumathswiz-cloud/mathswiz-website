export function parseMathpixMarkdown(markdown: string): string[] {
  const blocks = markdown.split(/\n\n+/).map(b => b.trim()).filter(Boolean);
  const problems: string[] = [];
  const buffer: string[] = [];

  const isProblemStart = (text: string): boolean => {
    const lower = text.toLowerCase();
    if (/^\d+[\.\)]\s/.test(text)) return true;
    if (/^\(\d+\)\s/.test(text)) return true;
    if (/^Q\d*[\.\):]\s/i.test(text)) return true;
    if (/^\*\*(?:example|exercise|question|problem|q\.|illustration|solve|find|evaluate|prove|show|determine)\b/i.test(lower)) return true;
    if (/^(?:example|exercise|question|problem|illustration)\s*\d*\b/i.test(lower)) return true;
    if (/^\([a-z]\)\s/.test(text)) return true;
    return false;
  };

  const isPageNoOrHeader = (text: string): boolean => {
    const t = text.trim();
    if (/^\d+$/.test(t) && t.length < 5) return true;
    if (/^(page|pg)\s*\d+$/i.test(t)) return true;
    if (/^chapter\s+\d+/i.test(t)) return true;
    if (/^[\d.]+\s*(?:marks|hours)/i.test(t)) return true;
    return false;
  };

  for (const block of blocks) {
    if (isPageNoOrHeader(block)) continue;

    if (isProblemStart(block) && buffer.length > 0) {
      const merged = buffer.join('\n\n');
      if (merged.length > 20) problems.push(merged);
      buffer.length = 0;
    }

    buffer.push(block);
  }

  if (buffer.length > 0) {
    const merged = buffer.join('\n\n');
    if (merged.length > 20) problems.push(merged);
  }

  return problems;
}
