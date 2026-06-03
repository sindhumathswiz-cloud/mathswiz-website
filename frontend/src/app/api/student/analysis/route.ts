import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const studentId = (session.user as any).id;

    // Get all test responses for this student
    const responses = await (prisma as any).testResponse.findMany({
      where: {
        attempt: {
          userId: studentId,
          status: 'SUBMITTED',
        },
      },
      include: {
        question: {
          select: {
            topic: true,
            difficulty: true,
          },
        },
      },
    });

    // Aggregate by topic
    const topicStats: Record<string, { correct: number; total: number; difficulty: string[] }> = {};

    responses.forEach((response: any) => {
      const topic = response.question?.topic || 'General';
      if (!topicStats[topic]) {
        topicStats[topic] = { correct: 0, total: 0, difficulty: [] };
      }
      topicStats[topic].total++;
      if (response.isCorrect) {
        topicStats[topic].correct++;
      }
      if (response.question?.difficulty) {
        topicStats[topic].difficulty.push(response.question.difficulty);
      }
    });

    // Calculate confidence percentages
    const topicAnalysis = Object.entries(topicStats).map(([topic, stats]) => {
      const confidence = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      
      // Calculate average difficulty
      const diffMap: Record<string, number> = { EASY: 1, MEDIUM: 2, HARD: 3 };
      const avgDifficulty = stats.difficulty.length > 0
        ? stats.difficulty.reduce((sum: number, d: string) => sum + (diffMap[d] || 2), 0) / stats.difficulty.length
        : 2;

      return {
        topic,
        confidence,
        totalQuestions: stats.total,
        correctAnswers: stats.correct,
        avgDifficulty: avgDifficulty.toFixed(1),
        status: confidence >= 80 ? 'STRONG' : confidence >= 60 ? 'MODERATE' : 'WEAK',
      };
    });

    // Sort by confidence ascending (weakest first)
    topicAnalysis.sort((a, b) => a.confidence - b.confidence);

    // Overall stats
    const totalQuestions = topicAnalysis.reduce((sum, t) => sum + t.totalQuestions, 0);
    const totalCorrect = topicAnalysis.reduce((sum, t) => sum + t.correctAnswers, 0);
    const overallConfidence = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    // Get weak topics (confidence < 60%)
    const weakTopics = topicAnalysis.filter(t => t.confidence < 60);
    const strongTopics = topicAnalysis.filter(t => t.confidence >= 80);

    return NextResponse.json({
      success: true,
      overallConfidence,
      totalTopics: topicAnalysis.length,
      weakTopicsCount: weakTopics.length,
      strongTopicsCount: strongTopics.length,
      topics: topicAnalysis,
      weakTopics,
      strongTopics,
    });
  } catch (error: any) {
    console.error('Error fetching topic analysis:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
