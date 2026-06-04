import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseQuestionsFromMarkdown } from "@/lib/question-parser";
import { fetchFromLLM } from "@/lib/llm";

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
        sourceDocument: {
          include: {
            pages: { orderBy: { pageNumber: 'asc' } }
          }
        },
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

    const authoredQuestions = (extractionSession.authoredQuestions || []) as any[];
    const matches: { questionId: string; questionIndex: number; solutionText: string; confidence: number }[] = [];

    // Strategy A: Separate solution document
    if (extractionSession.solutionDocument) {
      const solutionPages = extractionSession.solutionDocument.pages;
      const allSolutionText = solutionPages.map(p => p.rawMarkdown).join('\n\n');

      for (const q of authoredQuestions) {
        const questionIdx = authoredQuestions.indexOf(q);
        const searchText = q.question || q.assertion || '';

        if (!searchText) {
          matches.push({ questionId: q.id, questionIndex: questionIdx, solutionText: '', confidence: 0 });
          continue;
        }

        let bestMatch = '';
        let bestScore = 0;

        const qNumMatch = searchText.match(/^\s*(?:Q\.?\s*)?(\d+)/i);
        if (qNumMatch) {
          const qNum = qNumMatch[1];
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

        // LLM verification for low-confidence matches
        if (bestMatch && bestScore < 60) {
          try {
            const verifyResult = await fetchFromLLM(
              'Given a question and a candidate solution, respond with ONLY "YES" if the solution matches/answers the question, or "NO" if it does not.',
              `Question: ${searchText}\n\nCandidate Solution: ${bestMatch}\n\nDoes this solution match the question?`
            );
            if (verifyResult.trim().toUpperCase().startsWith('NO')) {
              bestScore = Math.min(bestScore, 30);
            } else {
              bestScore = Math.max(bestScore, 60);
            }
          } catch {
            // LLM unavailable, keep heuristic score
          }
        }

        matches.push({
          questionId: q.id,
          questionIndex: questionIdx,
          solutionText: bestMatch,
          confidence: Math.round(bestScore),
        });
      }
    }
    // Strategy B: Inline solution extraction from source document (mixed document)
    else if (extractionSession.sourceDocument) {
      const sourcePages = extractionSession.sourceDocument.pages;
      const allSourceText = sourcePages.map(p => p.rawMarkdown).join('\n\n');

      const parsed = parseQuestionsFromMarkdown(allSourceText);

      for (const q of authoredQuestions) {
        const questionIdx = authoredQuestions.indexOf(q);
        const searchText = q.question || q.assertion || '';

        if (!searchText) {
          matches.push({ questionId: q.id, questionIndex: questionIdx, solutionText: '', confidence: 0 });
          continue;
        }

        let bestMatch = '';
        let bestScore = 0;

        const qNumMatch = searchText.match(/^\s*(?:Q\.?\s*)?(\d+)/i);
        const qNum = qNumMatch ? qNumMatch[1] : null;

        // Try to find via parsed question number
        if (qNum) {
          const matchedParsed = parsed.find(p => p.number?.toString() === qNum);
          if (matchedParsed?.solution) {
            bestMatch = matchedParsed.solution;
            bestScore = 80;
          }
        }

        // Fallback: keyword overlap with full source text
        if (!bestMatch) {
          const keywords = searchText
            .replace(/\\[a-zA-Z]+/g, '')
            .replace(/[\$_{}()]/g, '')
            .split(/\s+/)
            .filter((w: string) => w.length > 4)
            .map((w: string) => w.toLowerCase());

          if (keywords.length > 0) {
            const sections = allSourceText.split(/\n\s*(?:\d+[.)]\s|Q\.?\s*\d+|Sol|Solution|Answer)/i);
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

        // LLM verification
        if (bestMatch && bestScore < 60) {
          try {
            const verifyResult = await fetchFromLLM(
              'Given a question and a candidate solution, respond with ONLY "YES" if the solution matches/answers the question, or "NO" if it does not.',
              `Question: ${searchText}\n\nCandidate Solution: ${bestMatch}\n\nDoes this solution match the question?`
            );
            if (verifyResult.trim().toUpperCase().startsWith('NO')) {
              bestScore = Math.min(bestScore, 30);
            } else {
              bestScore = Math.max(bestScore, 60);
            }
          } catch {
            // LLM unavailable
          }
        }

        matches.push({
          questionId: q.id,
          questionIndex: questionIdx,
          solutionText: bestMatch,
          confidence: Math.round(bestScore),
        });
      }
    } else {
      return NextResponse.json({ success: false, error: "No source or solution documents available" }, { status: 400 });
    }

    return NextResponse.json({ success: true, matches });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to match solutions";
    console.error("[MATCH-SOLUTIONS] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
