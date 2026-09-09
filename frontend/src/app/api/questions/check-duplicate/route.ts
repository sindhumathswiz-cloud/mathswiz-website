import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[$\\{}]/g, "")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeText(a).split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(normalizeText(b).split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return Math.round((intersection.size / union.size) * 100);
}

function trigramSimilarity(a: string, b: string): number {
  const trigrams = (s: string): Set<string> => {
    const t = "  " + normalizeText(s) + " ";
    const set = new Set<string>();
    for (let i = 0; i < t.length - 2; i++) set.add(t.substring(i, i + 3));
    return set;
  };
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  const intersection = new Set([...ta].filter(t => tb.has(t)));
  const union = new Set([...ta, ...tb]);
  return Math.round((intersection.size / union.size) * 100);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { content } = await req.json();
    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const needle = normalizeText(content);

    const candidates = await prisma.question.findMany({
      where: session.user.role === "ADMIN" ? {} : {
        OR: [
          { scope: "PUBLIC" },
          { scope: "TEACHER_PRIVATE", createdById: session.user.id },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        content: true,
        options: true,
        explanation: true,
        type: true,
        difficulty: true,
        class: true,
        topic: true,
        subject: true,
        examType: true,
        tags: true,
        status: true,
      },
    });

    interface MatchCandidate {
      id: string;
      content: string;
      options: any;
      explanation: string | null;
      type: string;
      difficulty: string;
      class: string | null;
      topic: string | null;
      subject: string | null;
      examType: string | null;
      tags: string[];
      status: string;
      similarity: number;
      matchType: "exact" | "similar" | "none";
    }

    let bestMatch: MatchCandidate | null = null;

    for (const c of candidates) {
      const hay = normalizeText(c.content);

      if (needle === hay && needle.length > 20) {
        return NextResponse.json({
          isDuplicate: true,
          existingId: c.id,
          similarity: 100,
          matchType: "exact",
          matchContent: c.content,
          matchOptions: c.options,
          matchExplanation: c.explanation,
          matchTypeLabel: c.type,
          matchDifficulty: c.difficulty,
          matchClass: c.class,
          matchTopic: c.topic,
          matchSubject: c.subject,
          matchExamType: c.examType,
          matchTags: c.tags,
          matchStatus: c.status,
        });
      }

      const triSim = trigramSimilarity(needle, hay);
      const jacSim = jaccardSimilarity(needle, hay);
      const sim = Math.max(triSim, jacSim);

      if (sim > (bestMatch?.similarity ?? 0)) {
        bestMatch = {
          id: c.id,
          content: c.content,
          options: c.options,
          explanation: c.explanation,
          type: c.type,
          difficulty: c.difficulty,
          class: c.class,
          topic: c.topic,
          subject: c.subject,
          examType: c.examType,
          tags: c.tags,
          status: c.status,
          similarity: sim,
          matchType: sim >= 85 ? "similar" : "none",
        };
      }
    }

    const isDuplicate = bestMatch ? bestMatch.similarity >= 85 : false;

    return NextResponse.json({
      isDuplicate,
      existingId: bestMatch?.id ?? null,
      matchContent: bestMatch?.content ?? null,
      similarity: bestMatch?.similarity ?? 0,
      matchType: bestMatch?.matchType ?? "none",
      matchOptions: bestMatch?.options ?? null,
      matchExplanation: bestMatch?.explanation ?? null,
      matchTypeLabel: bestMatch?.type ?? null,
      matchDifficulty: bestMatch?.difficulty ?? null,
      matchClass: bestMatch?.class ?? null,
      matchTopic: bestMatch?.topic ?? null,
      matchSubject: bestMatch?.subject ?? null,
      matchExamType: bestMatch?.examType ?? null,
      matchTags: bestMatch?.tags ?? null,
      matchStatus: bestMatch?.status ?? null,
    });
  } catch (error: any) {
    console.error("[check-duplicate]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


