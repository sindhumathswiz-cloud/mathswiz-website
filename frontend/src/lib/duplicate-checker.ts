import prisma from "@/lib/prisma";

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchType: "exact" | "similar" | "none";
  similarity: number;
  matchedQuestionId: string | null;
  matchedQuestionText: string | null;
}

// Normalize text for exact comparison
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[$\\{}]/g, "")
    .replace(/[^\w\s]/g, "")
    .trim();
}

// Simple hash for exact matching
function hashText(text: string): string {
  let hash = 0;
  const normalized = normalizeText(text);
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}

// Check a single question against the database
export async function checkDuplicate(
  questionText: string,
  options?: {
    subject?: string;
    topic?: string;
    class?: string;
  }
): Promise<DuplicateCheckResult> {
  const normalized = normalizeText(questionText);
  const existingQuestions = await prisma.question.findMany({
    where: {
      status: "APPROVED",
      ...(options?.subject ? { subject: options.subject } : {}),
      ...(options?.topic ? { topic: options.topic } : {}),
      ...(options?.class ? { class: options.class } : {}),
    },
    select: {
      id: true,
      content: true,
    },
  });

  // Check exact match
  const inputHash = hashText(questionText);
  for (const q of existingQuestions) {
    const qHash = hashText(q.content);
    if (qHash === inputHash && normalized.length > 20) {
      return {
        isDuplicate: true,
        matchType: "exact",
        similarity: 100,
        matchedQuestionId: q.id,
        matchedQuestionText: q.content.substring(0, 200),
      };
    }
  }

  // Fuzzy match: check for high text overlap
  const inputWords = new Set(normalized.split(/\s+/).filter(w => w.length > 3));
  let bestMatch: DuplicateCheckResult = {
    isDuplicate: false,
    matchType: "none",
    similarity: 0,
    matchedQuestionId: null,
    matchedQuestionText: null,
  };

  for (const q of existingQuestions) {
    const qNormalized = normalizeText(q.content);
    const qWords = new Set(qNormalized.split(/\s+/).filter(w => w.length > 3));
    
    // Jaccard similarity
    const intersection = new Set([...inputWords].filter(w => qWords.has(w)));
    const union = new Set([...inputWords, ...qWords]);
    const sim = union.size > 0 ? Math.round((intersection.size / union.size) * 100) : 0;
    
    if (sim > bestMatch.similarity) {
      bestMatch = {
        isDuplicate: sim >= 85,
        matchType: sim >= 85 ? "similar" : "none",
        similarity: sim,
        matchedQuestionId: q.id,
        matchedQuestionText: q.content.substring(0, 200),
      };
    }
  }

  return bestMatch;
}

// Batch check multiple questions
export async function checkDuplicates(
  questions: { text: string; subject?: string; topic?: string; class?: string }[]
): Promise<DuplicateCheckResult[]> {
  const results: DuplicateCheckResult[] = [];
  for (const q of questions) {
    const result = await checkDuplicate(q.text, {
      subject: q.subject,
      topic: q.topic,
      class: q.class,
    });
    results.push(result);
  }
  return results;
}
