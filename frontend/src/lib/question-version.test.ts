import { describe, expect, it, vi } from 'vitest';
import { snapshotQuestionVersion } from './question-version';

const baseSnapshot = {
  id: 'q1',
  currentVersion: 2,
  content: 'What is 2+2?',
  options: ['3', '4', '5', '6'],
  correctAnswer: '4',
  explanation: 'Basic addition',
  type: 'MCQ',
  difficulty: 'EASY',
  topic: 'Arithmetic',
  subTopic: 'Addition',
  tags: ['math'],
};

describe('snapshotQuestionVersion', () => {
  it('writes a QuestionVersion row carrying the PRIOR content and version number', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'v1' });
    const client = { questionVersion: { create } };

    await snapshotQuestionVersion(client, baseSnapshot, 'admin-1', 'Manual edit');

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        questionId: 'q1',
        version: 2,
        content: 'What is 2+2?',
        correctAnswer: '4',
        changedBy: 'admin-1',
        changeReason: 'Manual edit',
      }),
    });
  });

  it('omits changeReason from the write when none is given', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'v1' });
    const client = { questionVersion: { create } };

    await snapshotQuestionVersion(client, baseSnapshot, 'admin-1');

    const call = create.mock.calls[0][0];
    expect(call.data.changeReason).toBeUndefined();
  });
});
