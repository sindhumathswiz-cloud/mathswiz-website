/**
 * Snaps a free-text topic (from OCR/LLM extraction or a chapter heading) to a
 * canonical CBSE chapter name. Without this, ingestion writes drifting topic
 * strings ("Integration", "Limits", "3D Geometry") that never match the
 * canonical chapters students filter by ("Integrals", "Continuity and
 * Differentiability", "Three Dimensional Geometry").
 *
 * The canonical lists mirror the NCERT/CBSE syllabus (prisma/syllabus/cbse.json).
 * Kept as constants here so the function is pure and unit-testable; the DB
 * TagTaxonomy remains the runtime source of truth for the UI.
 */

const CLASS_12_CHAPTERS = [
  'Relations and Functions',
  'Inverse Trigonometric Functions',
  'Matrices',
  'Determinants',
  'Continuity and Differentiability',
  'Application of Derivatives',
  'Integrals',
  'Application of Integrals',
  'Differential Equations',
  'Vector Algebra',
  'Three Dimensional Geometry',
  'Linear Programming',
  'Probability',
];

const CLASS_11_CHAPTERS = [
  'Sets',
  'Relations and Functions',
  'Trigonometric Functions',
  'Complex Numbers and Quadratic Equations',
  'Linear Inequalities',
  'Permutations and Combinations',
  'Binomial Theorem',
  'Sequences and Series',
  'Straight Lines',
  'Conic Sections',
  'Introduction to Three Dimensional Geometry',
  'Limits and Derivatives',
  'Statistics',
  'Probability',
];

/** keyword (normalized substring) -> canonical chapter. Ordered specific → generic. */
const ALIASES: [string, string][] = [
  ['application of integral', 'Application of Integrals'],
  ['area under', 'Application of Integrals'],
  ['application of derivative', 'Application of Derivatives'],
  ['maxima', 'Application of Derivatives'],
  ['minima', 'Application of Derivatives'],
  ['rate of change', 'Application of Derivatives'],
  ['tangent', 'Application of Derivatives'],
  ['inverse trig', 'Inverse Trigonometric Functions'],
  ['differential equation', 'Differential Equations'],
  ['continuity', 'Continuity and Differentiability'],
  ['differentiability', 'Continuity and Differentiability'],
  ['differentiation', 'Continuity and Differentiability'],
  ['integration', 'Integrals'],
  ['integral', 'Integrals'],
  ['antiderivative', 'Integrals'],
  ['vector', 'Vector Algebra'],
  ['three dimensional', 'Three Dimensional Geometry'],
  ['3 dimensional', 'Three Dimensional Geometry'],
  ['3d', 'Three Dimensional Geometry'],
  ['linear programming', 'Linear Programming'],
  ['lpp', 'Linear Programming'],
  ['probability', 'Probability'],
  ['matrix', 'Matrices'],
  ['matrices', 'Matrices'],
  ['determinant', 'Determinants'],
  ['relation', 'Relations and Functions'],
];

const STOPWORDS = new Set(['and', 'of', 'the', 'in', 'to', 'a', 'an']);

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(' ').filter((t) => t && !STOPWORDS.has(t));
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a), sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/**
 * Derive a human chapter name from an uploaded file name, e.g.
 *   "1778608132157_Limits.pdf" -> "Limits"
 *   "Application-of-Integrals.pdf" -> "Application of Integrals"
 * Returns a cleaned string suitable for snapToChapter (not yet snapped).
 */
export function chapterFromFilename(filename: string | null | undefined): string {
  if (!filename) return '';
  let base = filename.split(/[\\/]/).pop() || filename; // strip any path
  base = base.replace(/\.[a-z0-9]+$/i, '');             // strip extension
  base = base.replace(/^\d{6,}[_-]/, '');               // strip "timestamp_" prefix
  base = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base;
}

/** Canonical chapter list for a class. Class 11 includes "Limits and Derivatives". */
export function canonicalChapters(className?: string): string[] {
  if (className && /\b11\b|xi\b/i.test(className)) return CLASS_11_CHAPTERS;
  return CLASS_12_CHAPTERS;
}

/**
 * Returns the canonical chapter name for a free-text topic, or `null` if no
 * confident match (caller should keep the raw topic rather than mis-file it).
 */
export function snapToChapter(rawTopic: string | null | undefined, className?: string): string | null {
  if (!rawTopic) return null;
  const chapters = canonicalChapters(className);
  const n = normalize(rawTopic);
  if (!n) return null;

  // 1. Exact (normalized) match — handles "Application of Integrals" before the
  //    generic "integral" alias would mis-route it.
  for (const c of chapters) {
    if (normalize(c) === n) return c;
  }

  // Class-12 specific: limits live under Continuity & Differentiability.
  if (/\blimit/.test(n) && chapters === CLASS_12_CHAPTERS) {
    return 'Continuity and Differentiability';
  }

  // 2. Alias keywords (first, most-specific match wins).
  for (const [kw, canonical] of ALIASES) {
    if (n.includes(kw) && chapters.includes(canonical)) return canonical;
  }

  // 3. Token-overlap fallback for close-but-not-exact names.
  let best: string | null = null;
  let bestScore = 0;
  const nt = tokens(n);
  for (const c of chapters) {
    const score = jaccard(nt, tokens(c));
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= 0.5 ? best : null;
}
