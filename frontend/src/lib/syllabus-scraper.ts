/**
 * NCERT PDF scraper for CBSE Mathematics.
 * Maps topic names to NCERT textbook chapter codes and downloads PDFs
 * for processing through the Mathpix extraction pipeline.
 */

// Class 12 NCERT chapter mapping (topic name → PDF code)
const NCERT_CLASS_12: Record<string, string> = {
  "Relations and Functions": "lemh101",
  "Inverse Trigonometric Functions": "lemh102",
  "Matrices": "lemh103",
  "Determinants": "lemh104",
  "Continuity and Differentiability": "lemh105",
  "Application of Derivatives": "lemh106",
  "Integrals": "lemh107",
  "Application of Integrals": "lemh108",
  "Differential Equations": "lemh109",
  "Vector Algebra": "lemh110",
  "Three Dimensional Geometry": "lemh111",
  "Linear Programming": "lemh112",
  "Probability": "lemh113",
};

// Class 11 NCERT chapter mapping
const NCERT_CLASS_11: Record<string, string> = {
  "Sets": "kemh101",
  "Relations and Functions": "kemh102",
  "Trigonometric Functions": "kemh103",
  "Complex Numbers and Quadratic Equations": "kemh104",
  "Linear Inequalities": "kemh105",
  "Permutations and Combinations": "kemh106",
  "Binomial Theorem": "kemh107",
  "Sequences and Series": "kemh108",
  "Straight Lines": "kemh109",
  "Conic Sections": "kemh110",
  "Introduction to Three Dimensional Geometry": "kemh111",
  "Limits and Derivatives": "kemh112",
  "Statistics": "kemh113",
  "Probability": "kemh114",
};

// Class 10 NCERT chapter mapping
const NCERT_CLASS_10: Record<string, string> = {
  "Real Numbers": "jesc101",
  "Polynomials": "jesc102",
  "Pair of Linear Equations in Two Variables": "jesc103",
  "Quadratic Equations": "jesc104",
  "Arithmetic Progressions": "jesc105",
  "Triangles": "jesc106",
  "Coordinate Geometry": "jesc107",
  "Introduction to Trigonometry": "jesc108",
  "Applications of Trigonometry": "jesc109",
  "Circles": "jesc110",
  "Areas Related to Circles": "jesc111",
  "Surface Areas and Volumes": "jesc112",
  "Statistics": "jesc113",
  "Probability": "jesc114",
};

const NCERT_MAP: Record<string, Record<string, string>> = {
  "Class 10": NCERT_CLASS_10,
  "Class 11": NCERT_CLASS_11,
  "Class 12": NCERT_CLASS_12,
};

const NCERT_BASE = "https://ncert.nic.in/textbook/pdf";

export interface ScrapeResult {
  success: boolean;
  pdfUrl?: string;
  error?: string;
  pdfBuffer?: Buffer;
}

/**
 * Returns the NCERT textbook PDF URL for a given class and topic name.
 */
export function getNcertPdfUrl(className: string, topicName: string): string | null {
  const classMap = NCERT_MAP[className];
  if (!classMap) return null;
  const code = classMap[topicName];
  if (!code) {
    // Try fuzzy match
    const lower = topicName.toLowerCase();
    const key = Object.keys(classMap).find((k) => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase()));
    if (!key) return null;
    return `${NCERT_BASE}/${classMap[key]}.pdf`;
  }
  return `${NCERT_BASE}/${code}.pdf`;
}

/**
 * Downloads the NCERT textbook PDF for a given class and topic.
 * Returns the PDF as a Buffer if successful.
 */
export async function downloadNcertPdf(
  className: string,
  topicName: string,
): Promise<ScrapeResult> {
  const url = getNcertPdfUrl(className, topicName);
  if (!url) {
    return { success: false, error: `No NCERT mapping for ${className} / ${topicName}` };
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MathswizBot/1.0)" },
    });
    if (!res.ok) {
      return { success: false, error: `NCERT download failed: ${res.status}` };
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return { success: true, pdfUrl: url, pdfBuffer: buffer };
  } catch (e: any) {
    return { success: false, error: `NCERT download error: ${e.message}` };
  }
}

/**
 * List of all available classes for NCERT Mathematics.
 */
export function getAvailableClasses(): string[] {
  return Object.keys(NCERT_MAP);
}

/**
 * Returns the PDF code for a class+topic, or null if not found.
 */
export function getTopicPdfCode(className: string, topicName: string): string | null {
  const classMap = NCERT_MAP[className];
  if (!classMap) return null;
  return classMap[topicName] || null;
}
