// ─── Tag Extraction Engine ───────────────────────────────────────────────────

export interface ExtractedTag {
  tag: string;
  source: string; // The original text that triggered this tag
  confidence: number; // 0-100
}

// Known tag patterns with their mappings
const TAG_RULES: { pattern: RegExp; mapper: (match: RegExpMatchArray) => string[] }[] = [
  // CBSE patterns
  {
    pattern: /\[CBSE\s*(\d{4})\s*(?:Term[-\s]*(\d))?\]/i,
    mapper: (m) => {
      const tags = ["CBSE", "PYQ"];
      if (m[1]) tags.push(m[1]);
      if (m[2]) tags.push(`TERM_${m[2]}`);
      return tags;
    },
  },
  {
    pattern: /\[CBSE\s*Term[-\s]*(\d)\s*,?\s*(\d{4})[-\s]*(\d{4})?\]/i,
    mapper: (m) => ["CBSE", "PYQ", `TERM_${m[1]}`, m[2]],
  },
  {
    pattern: /\[CBSE\s*(\d{4})\s*\(\s*([\d/]+)\s*\)\]/i,
    mapper: (m) => ["CBSE", "PYQ", m[1], `SET_${m[2].replace(/\//g, "_")}`],
  },

  // NCERT
  { pattern: /\[NCERT\s*Exemplar\]/i, mapper: () => ["NCERT", "EXEMPLAR"] },
  { pattern: /\[NCERT\]/i, mapper: () => ["NCERT"] },

  // PYQ
  { pattern: /\[PYQ\]/i, mapper: () => ["PYQ"] },

  // Competency
  {
    pattern: /\[Competency\s*Based\s*(?:Question)?\]/i,
    mapper: () => ["COMPETENCY"],
  },

  // Exam types
  { pattern: /\[NDA\]/i, mapper: () => ["NDA", "PYQ"] },
  { pattern: /\[JEE\s*Main\]/i, mapper: () => ["JEE_MAIN", "PYQ"] },
  { pattern: /\[JEE\s*Advanced\]/i, mapper: () => ["JEE_ADVANCED", "PYQ"] },
  { pattern: /\[CUET\]/i, mapper: () => ["CUET", "PYQ"] },

  // Year patterns (standalone)
  { pattern: /\b(20\d{2})\b/, mapper: (m) => [m[1]] },
];

export function extractTags(text: string): ExtractedTag[] {
  const results: ExtractedTag[] = [];
  const seen = new Set<string>();

  for (const rule of TAG_RULES) {
    const match = text.match(rule.pattern);
    if (match) {
      const tags = rule.mapper(match);
      for (const tag of tags) {
        const normalized = tag.toUpperCase().replace(/\s+/g, "_");
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized);
          results.push({
            tag: normalized,
            source: match[0],
            confidence: 95,
          });
        }
      }
    }
  }

  // Catch any remaining [...] patterns as custom tags
  const bracketMatches = text.match(/\[([^\]]{1,50})\]/g);
  if (bracketMatches) {
    for (const m of bracketMatches) {
      const inner = m.slice(1, -1).trim();
      if (inner && inner.length > 1) {
        const normalized = inner.toUpperCase().replace(/\s+/g, "_");
        if (!seen.has(normalized)) {
          seen.add(normalized);
          results.push({
            tag: normalized,
            source: m,
            confidence: 70, // Lower confidence for unknown patterns
          });
        }
      }
    }
  }

  return results;
}

// Get unique tag names from extracted tags
export function getTagNames(tags: ExtractedTag[]): string[] {
  return [...new Set(tags.map((t) => t.tag))];
}

// Remove tag patterns from text (clean version)
export function cleanTagText(text: string): string {
  let cleaned = text;
  for (const rule of TAG_RULES) {
    cleaned = cleaned.replace(rule.pattern, "");
  }
  // Remove remaining [...] patterns
  cleaned = cleaned.replace(/\[[^\]]{1,50}\]/g, "");
  // Clean up extra whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}
