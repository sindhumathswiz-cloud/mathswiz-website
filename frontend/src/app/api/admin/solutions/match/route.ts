import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { matchSolutionsForDocument, verifyMatchWithLLM } from '@/lib/solution-matcher';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
        }

        const body = await req.json();
        const { documentId, autoLink = false } = body;

        if (!documentId) {
            return NextResponse.json({ error: 'documentId required' }, { status: 400 });
        }

        const matches = await matchSolutionsForDocument(documentId);

        if (autoLink) {
            const questions = await prisma.question.findMany({
                where: { sourceDocumentId: documentId },
                select: { id: true, content: true }
            });

            for (const match of matches) {
                const matchedQuestion = questions.find(q =>
                    q.content.slice(0, 30).includes(match.questionNumber) ||
                    match.content.includes(q.content.slice(0, 20))
                );

                if (matchedQuestion) {
                    const llmVerify = await verifyMatchWithLLM(matchedQuestion.content, match.content);

                    await prisma.solution.create({
                        data: {
                            questionId: matchedQuestion.id,
                            content: match.content,
                            confidence: llmVerify.confidence * 100,
                            isVerified: llmVerify.confidence > 0.8,
                        }
                    });
                }
            }
        }

        return NextResponse.json({ success: true, matches, count: matches.length });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
