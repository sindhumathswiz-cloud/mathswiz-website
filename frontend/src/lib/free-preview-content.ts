import prisma from '@/lib/prisma';
import { parseQuestionOptions } from '@/lib/arena-answer';

export type FreePreviewQuestion = {
  id: string;
  content: string;
  options: string[];
  difficulty: string;
  topic: string;
  isInteractive: boolean;
  explanation: string | null;
};

export type FreePreviewChapter = {
  classLevel: 'Class 11' | 'Class 12';
  chapterName: string;
  questions: FreePreviewQuestion[];
};

const freeQuestionWhere = { status: 'APPROVED' as const, scope: 'PUBLIC' as const, correctAnswer: { not: '' } };

function toPreviewQuestion(question: any): FreePreviewQuestion | null {
  const options = parseQuestionOptions(question.options);
  return question.content
    ? { id: question.id, content: question.content, options, difficulty: question.difficulty, topic: question.topic || 'Chapter practice', isInteractive: options.length >= 2 && Boolean(question.correctAnswer), explanation: question.explanation || null }
    : null;
}

export async function getFreePreviewChapters(): Promise<FreePreviewChapter[]> {
  const levels: Array<'Class 11' | 'Class 12'> = ['Class 11', 'Class 12'];
  return Promise.all(levels.map(async (classLevel) => {
    const grade = classLevel.endsWith('11') ? '11' : '12';
    const chapter = await prisma.bookChapter.findFirst({
      where: { book: { className: { contains: grade, mode: 'insensitive' }, isActive: true }, questions: { some: { status: 'APPROVED', scope: 'PUBLIC' } } },
      orderBy: { orderIndex: 'asc' },
      select: {
        id: true, name: true, topic: true,
        questions: { where: { status: 'APPROVED', scope: 'PUBLIC' }, orderBy: { updatedAt: 'desc' }, take: 60, select: { id: true, content: true, options: true, correctAnswer: true, explanation: true, difficulty: true, topic: true } },
      },
    });
    const questions = (chapter?.questions || []).map(toPreviewQuestion).filter((question): question is FreePreviewQuestion => Boolean(question));
    // Legacy imports without book/chapter links still get a public preview.
    // The preferred topic names are the first NCERT chapters; the fallback keeps
    // the preview functional until the legacy records are fully mapped.
    const preferredTopic = classLevel === 'Class 11' ? 'Sets' : 'Relations and Functions';
    const legacy = await prisma.question.findMany({
      where: { status: 'APPROVED', scope: 'PUBLIC' }, orderBy: { updatedAt: 'desc' }, take: 1000,
      select: { id: true, content: true, options: true, correctAnswer: true, explanation: true, difficulty: true, topic: true, class: true, questionTags: { include: { tag: { select: { name: true, type: true } } } } },
    });
    const classMatches = (question: typeof legacy[number]) => {
      const labels = [question.class || '', ...question.questionTags.filter(item => item.tag.type === 'CLASS').map(item => item.tag.name)].join(' ').toLowerCase();
      return grade === '11' ? /(^|\D)(11|xi)(\D|$)/i.test(labels) : /(^|\D)(12|xii)(\D|$)/i.test(labels);
    };
    const preferredRows = legacy.filter(question => {
      const topic = (question.topic || '').toLowerCase();
      return classLevel === 'Class 11' ? topic.includes('set') : topic.includes('relation');
    });
    const chapterRows = preferredRows.filter(classMatches);
    // Some historic Class 12 imports have the chapter but no class tag. The
    // chapter identity is still reliable here because this is the canonical
    // first-chapter topic; prefer that over showing an empty preview.
    const fallbackRows = chapterRows.length ? chapterRows : preferredRows.length ? preferredRows : legacy.filter(classMatches);
    const fallbackQuestions = fallbackRows.map(toPreviewQuestion).filter((question): question is FreePreviewQuestion => Boolean(question));
    const combined = [...questions, ...fallbackQuestions].filter((question, index, all) => all.findIndex(candidate => candidate.id === question.id) === index).slice(0, 60);
    return { classLevel, chapterName: chapter?.name || chapter?.topic || fallbackQuestions[0]?.topic || preferredTopic, questions: combined };
  }));
}

export async function isFreePreviewQuestion(question: { class: string | null; topic: string | null; bookChapter: { orderIndex: number } | null }) {
  const topic = (question.topic || '').toLowerCase();
  if (topic.includes('sets') || topic.includes('relations and functions')) return true;
  return (question.class === 'Class 11' || question.class === 'Class 12') && question.bookChapter?.orderIndex === 0;
}
