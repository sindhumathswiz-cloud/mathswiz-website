import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const recordAuditLog = vi.fn();
const batchEnrollment = { findFirst: vi.fn(), findMany: vi.fn() };
const intervention = { create: vi.fn(), findMany: vi.fn() };
const notification = { create: vi.fn() };
const studentProgress = { findMany: vi.fn(), findFirst: vi.fn() };
const test = { create: vi.fn() };
const testAssignment = { create: vi.fn() };
const selectQuestionsByFilters = vi.fn();
const masteryToDifficultyBand = vi.fn();
const transaction = vi.fn(async (callback) => callback({ intervention, notification, test, testAssignment }));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  default: { batchEnrollment, intervention, notification, studentProgress, $transaction: transaction },
}));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));
vi.mock('@/lib/question-selection', () => ({ selectQuestionsByFilters, masteryToDifficultyBand }));

function post(body: unknown) {
  return new Request('http://localhost/api/teacher/interventions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('teacher interventions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    batchEnrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
    intervention.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'intervention-1', studentId: 'student-1', ...data }));
    studentProgress.findFirst.mockResolvedValue(null);
    masteryToDifficultyBand.mockReturnValue(['EASY']);
    // Default: no matching questions, so existing (pre-Phase-2) test cases
    // keep exercising the description-only path unless a test opts in.
    selectQuestionsByFilters.mockResolvedValue([]);
    test.create.mockResolvedValue({ id: 'test-1' });
    testAssignment.create.mockResolvedValue({ id: 'assignment-1' });
  });

  it('assigns support within an owned batch and records the notification and audit', async () => {
    const { POST } = await import('./route');
    const response = await POST(post({
      studentId: 'student-1', batchId: 'batch-1', topic: 'Algebra',
      title: 'Algebra support', description: 'Complete targeted practice.', type: 'PRACTICE',
    }));

    expect(response.status).toBe(201);
    expect(batchEnrollment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ studentId: 'student-1', batchId: 'batch-1', batch: { teacherId: 'teacher-1' } }),
    }));
    expect(intervention.create).toHaveBeenCalledWith({ data: expect.objectContaining({ teacherId: 'teacher-1', studentId: 'student-1' }) });
    expect(notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'student-1', type: 'INTERVENTION' }) });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'INTERVENTION_ASSIGNED', entityId: 'intervention-1' }));
  });

  it('rejects a student outside the teacher owned batch', async () => {
    batchEnrollment.findFirst.mockResolvedValue(null);
    const { POST } = await import('./route');
    const response = await POST(post({ studentId: 'student-2', batchId: 'other-batch', topic: 'Geometry', title: 'Support', description: 'Review.' }));

    expect(response.status).toBe(404);
    expect(transaction).not.toHaveBeenCalled();
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  describe('content generation', () => {
    it('generates a Test+TestSection+TestQuestion+TestAssignment and links it on PRACTICE', async () => {
      studentProgress.findFirst.mockResolvedValue({ masteryScore: 15 });
      masteryToDifficultyBand.mockReturnValue(['EASY']);
      selectQuestionsByFilters.mockResolvedValue([{ id: 'q-1' }, { id: 'q-2' }]);

      const { POST } = await import('./route');
      const response = await POST(post({
        studentId: 'student-1', batchId: 'batch-1', topic: 'Algebra',
        title: 'Algebra support', description: 'Practice up.', type: 'PRACTICE',
      }));
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(selectQuestionsByFilters).toHaveBeenCalledWith([{ topic: 'Algebra', difficulty: 'EASY', count: 8 }]);
      expect(test.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          title: 'Remedial practice: Algebra',
          mode: 'PRACTICE',
          isPublished: true,
        }),
      }));
      expect(testAssignment.create).toHaveBeenCalledWith({
        data: { testId: 'test-1', studentId: 'student-1', kind: 'HOMEWORK', instructions: 'Practice up.' },
      });
      expect(intervention.create).toHaveBeenCalledWith({ data: expect.objectContaining({ testAssignmentId: 'assignment-1' }) });
      expect(body.intervention.testAssignmentId).toBe('assignment-1');
    });

    it('falls back to description-only when zero questions match the topic/band', async () => {
      selectQuestionsByFilters.mockResolvedValue([]);
      const { POST } = await import('./route');
      const response = await POST(post({
        studentId: 'student-1', batchId: 'batch-1', topic: 'ObscureTopic',
        title: 'Support', description: 'Read the chapter.', type: 'PRACTICE',
      }));

      expect(response.status).toBe(201);
      expect(test.create).not.toHaveBeenCalled();
      expect(testAssignment.create).not.toHaveBeenCalled();
      expect(intervention.create).toHaveBeenCalledWith({ data: expect.objectContaining({ testAssignmentId: null }) });
    });

    it('skips content generation entirely for non-practice/homework types', async () => {
      const { POST } = await import('./route');
      const response = await POST(post({
        studentId: 'student-1', batchId: 'batch-1', topic: 'Algebra',
        title: 'Live session', description: 'Join the call.', type: 'LIVE_SUPPORT',
      }));

      expect(response.status).toBe(201);
      expect(selectQuestionsByFilters).not.toHaveBeenCalled();
      expect(test.create).not.toHaveBeenCalled();
      expect(intervention.create).toHaveBeenCalledWith({ data: expect.objectContaining({ testAssignmentId: null }) });
    });

    it('also generates content for HOMEWORK-type interventions', async () => {
      selectQuestionsByFilters.mockResolvedValue([{ id: 'q-1' }]);
      const { POST } = await import('./route');
      const response = await POST(post({
        studentId: 'student-1', batchId: 'batch-1', topic: 'Algebra',
        title: 'Homework support', description: 'Extra homework.', type: 'HOMEWORK',
      }));

      expect(response.status).toBe(201);
      expect(selectQuestionsByFilters).toHaveBeenCalled();
      expect(test.create).toHaveBeenCalled();
    });
  });
});
