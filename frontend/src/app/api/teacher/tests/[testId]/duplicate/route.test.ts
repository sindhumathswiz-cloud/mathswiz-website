import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const recordAuditLog = vi.fn();
const test = { findFirst: vi.fn(), create: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { test } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

const params = (testId: string) => Promise.resolve({ testId });
function post() {
  return new Request('http://localhost/api/teacher/tests/test-1/duplicate', { method: 'POST' });
}

describe('POST /api/teacher/tests/[testId]/duplicate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
  });

  it('rejects non-teacher roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    const { POST } = await import('./route');
    const response = await POST(post(), { params: params('test-1') });
    expect(response.status).toBe(403);
  });

  it('403s when the test is not owned by the caller', async () => {
    test.findFirst.mockResolvedValue(null);
    const { POST } = await import('./route');
    const response = await POST(post(), { params: params('test-1') });
    expect(response.status).toBe(403);
    expect(test.create).not.toHaveBeenCalled();
  });

  it('deep-copies sections and questions into new, unpublished rows', async () => {
    test.findFirst.mockResolvedValue({
      id: 'test-1',
      title: 'Midterm',
      description: 'desc',
      class: 'Class 11',
      mode: 'STRICT',
      duration: 60,
      totalMarks: 40,
      templateType: 'WORKSHEET',
      sections: [
        { title: 'Section A', instructions: null, marksPerQuestion: 4, negativeMarks: 1, questions: [{ questionId: 'q-1', orderIndex: 0 }, { questionId: 'q-2', orderIndex: 1 }] },
      ],
    });
    test.create.mockResolvedValue({ id: 'test-2', title: 'Midterm (copy)', sections: [] });

    const { POST } = await import('./route');
    const response = await POST(post(), { params: params('test-1') });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.test.id).toBe('test-2');
    expect(test.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        title: 'Midterm (copy)',
        isPublished: false,
        templateType: 'WORKSHEET',
        sections: {
          create: [expect.objectContaining({
            title: 'Section A',
            questions: { create: [{ questionId: 'q-1', orderIndex: 0 }, { questionId: 'q-2', orderIndex: 1 }] },
          })],
        },
      }),
    }));
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'TEST_DUPLICATED', entityId: 'test-2' }));
  });
});
