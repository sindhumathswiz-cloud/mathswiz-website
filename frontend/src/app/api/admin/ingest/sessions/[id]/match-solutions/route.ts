import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const { id: sessionId } = await params;

    const extractionSession = await prisma.extractionSession.findUnique({
      where: { id: sessionId },
      include: {
        solutionDocument: {
          include: {
            pages: { orderBy: { pageNumber: 'asc' } }
          }
        }
      }
    });

    if (!extractionSession) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }
    if (extractionSession.userId !== userId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    if (!extractionSession.solutionDocument) {
      return NextResponse.json({ success: false, error: "No solutions PDF uploaded" }, { status: 400 });
    }

    const authoredQuestions = (extractionSession.authoredQuestions || []) as any[];
    const solutionPages = extractionSession.solutionDocument.pages;

    // Concatenate all solution pages into one text
    const allSolutionText = solutionPages.map(p => p.rawMarkdown).join('\n\n');

    // For each authored question, try to find a matching solution section
    const matches: { questionId: string; questionIndex: number; solutionText: string; confidence: number }[] = [];

    for (const q of authoredQuestions) {
      const questionIdx = authoredQuestions.indexOf(q);
      const searchText = q.question || q.assertion || '';
      
      if (!searchText) {
        matches.push({ questionId: q.id, questionIndex: questionIdx, solutionText: '', confidence: 0 });
        continue;
      }

      // Try to find in solutions text
      let bestMatch = '';
      let bestScore = 0;

      // Strategy 1: Look for "Q." or "Q" followed by number near the matching text
      const qNumMatch = searchText.match(/^\s*(?:Q\.?\s*)?(\d+)/i);
      if (qNumMatch) {
        const qNum = qNumMatch[1];
        // Look for sections that start with Q number, Sol., Solution, etc.
        const patterns = [
          new RegExp(`(?:^|\\n)\\s*${qNum}[.)]\\s*.*?(?:\\n\\s*(?:Sol|Solution|Ans)[.:]\\s*)([^]*?)(?=\\n\\s*\\d+[.)]\\s|$)`, 'i'),
          new RegExp(`(?:^|\\n)\\s*(?:Q\\.?\\s*)?${qNum}[.)]\\s*([^]*?)(?=\\n\\s*(?:Q\\.?\\s*)?\\d+[.)]\\s|$)`, 'im'),
          new RegExp(`(?:Sol|Solution|Answer)\\s*(?:of|to)?\\s*(?:Q\\.?\\s*)?${qNum}[.:]\\s*([^]*?)(?=\\n\\s*(?:Sol|Solution|Answer|Q\\.?\\s*\\d+)|$)`, 'i'),
        ];
        for (const pattern of patterns) {
          const match = allSolutionText.match(pattern);
          if (match) {
            const candidate = match[1] || match[0];
            if (candidate.length > bestMatch.length) {
              bestMatch = candidate.trim();
              bestScore = Math.min(100, 70 + candidate.length * 0.1);
            }
          }
        }
      }

      // Strategy 2: Keyword overlap
      if (!bestMatch) {
        const keywords = searchText
          .replace(/\\[a-zA-Z]+/g, '')
          .replace(/[\$_{}()]/g, '')
          .split(/\s+/)
          .filter((w: string) => w.length > 4)
          .map((w: string) => w.toLowerCase());
        
        if (keywords.length > 0) {
          const sections = allSolutionText.split(/\n\s*(?:\d+[.)]\s|Q\.?\s*\d+|Sol|Solution|Answer)/i);
          for (const section of sections) {
            const sectionLower = section.toLowerCase();
            const matchCount = keywords.filter((k: string) => sectionLower.includes(k)).length;
            const score = (matchCount / keywords.length) * 100;
            if (score > bestScore) {
              bestScore = score;
              bestMatch = section.trim();
            }
          }
        }
      }

      matches.push({
        questionId: q.id,
        questionIndex: questionIdx,
        solutionText: bestMatch,
        confidence: Math.round(bestScore),
      });
    }

    return NextResponse.json({ success: true, matches });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to match solutions";
    console.error("[MATCH-SOLUTIONS] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
