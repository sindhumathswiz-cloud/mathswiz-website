type QuestionVersionClient = {
  questionVersion: { create(args: unknown): Promise<unknown> };
};

export interface QuestionSnapshot {
  id: string;
  currentVersion: number;
  content: string;
  options: unknown;
  correctAnswer: string | null;
  explanation: string | null;
  type: string;
  difficulty: string;
  topic: string | null;
  subTopic: string | null;
  tags: string[];
}

/**
 * Snapshots a question's PRIOR state into QuestionVersion before it's
 * overwritten -- extracted from the one existing write site
 * (api/admin/questions/strip-leading-numbers/route.ts). Callers are
 * responsible for wrapping this and the actual content update in a single
 * transaction so the snapshot and the edit never diverge.
 */
export async function snapshotQuestionVersion(
  client: QuestionVersionClient,
  question: QuestionSnapshot,
  changedBy: string,
  changeReason?: string | null
) {
  return client.questionVersion.create({
    data: {
      questionId: question.id,
      version: question.currentVersion,
      content: question.content,
      options: question.options ?? undefined,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
      type: question.type,
      difficulty: question.difficulty,
      topic: question.topic,
      subTopic: question.subTopic,
      tags: question.tags,
      changedBy,
      changeReason: changeReason ?? undefined,
    },
  });
}
