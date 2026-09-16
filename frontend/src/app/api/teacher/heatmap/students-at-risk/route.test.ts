import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const batchEnrollment = { findMany: vi.fn() };
const studentProgress = { findMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { batchEnrollment, studentProgress } }));

function get(url: string) {
  return import('./route').then(({ GET }) => GET(new Request(url)));
}

describe('GET /api/teacher/heatmap/students-at-risk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
  });

  it('rejects a missing batchId', async () => {
    const response = await get('http://localhost/api/teacher/heatmap/students-at-risk');
    expect(response.status).toBe(400);
  });

  it('reuses the <40 mastery threshold, batch-scoped', async () => {
    batchEnrollment.findMany.mockResolvedValue([{ studentId: 's-1', student: { id: 's-1', firstName: 'A', lastName: 'B' } }]);
    studentProgress.findMany.mockResolvedValue([]);
    await get('http://localhost/api/teacher/heatmap/students-at-risk?batchId=batch-1');
    expect(studentProgress.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: { in: ['s-1'] }, masteryScore: { lt: 40 } },
    }));
  });

  it('aggregates weak-topic count and avg mastery per student, sorted weakest-first', async () => {
    batchEnrollment.findMany.mockResolvedValue([
      { studentId: 's-1', student: { id: 's-1', firstName: 'Asha', lastName: 'K' } },
      { studentId: 's-2', student: { id: 's-2', firstName: 'Ravi', lastName: 'M' } },
    ]);
    studentProgress.findMany.mockResolvedValue([
      { userId: 's-1', masteryScore: 30 },
      { userId: 's-1', masteryScore: 10 },
      { userId: 's-2', masteryScore: 35 },
    ]);
    const response = await get('http://localhost/api/teacher/heatmap/students-at-risk?batchId=batch-1');
    const body = await response.json();
    expect(body.students).toHaveLength(2);
    expect(body.students[0].id).toBe('s-1');
    expect(body.students[0].weakTopicCount).toBe(2);
    expect(body.students[0].avgMasteryAcrossWeakTopics).toBe(20);
  });

  it('returns empty students list for a batch with no enrollments', async () => {
    batchEnrollment.findMany.mockResolvedValue([]);
    const response = await get('http://localhost/api/teacher/heatmap/students-at-risk?batchId=batch-1');
    const body = await response.json();
    expect(body.students).toEqual([]);
  });
});
