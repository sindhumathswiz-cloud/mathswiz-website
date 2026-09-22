import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const parentLink = { findFirst: vi.fn() };
const testResponse = { findMany: vi.fn() };
const testAttempt = { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() };
const studentProgress = { findMany: vi.fn() };
const intervention = { findMany: vi.fn() };
const attendanceRecord = { findMany: vi.fn() };
const batchEnrollment = { findMany: vi.fn() };
const test = { findMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  default: { parentLink, testResponse, testAttempt, studentProgress, intervention, attendanceRecord, batchEnrollment, test },
}));

function get(qs = '?studentId=student-1') {
  return new Request(`http://localhost/api/parent/dashboard${qs}`);
}

describe('GET /api/parent/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'parent-1', role: 'PARENT' } });
    parentLink.findFirst.mockResolvedValue({ id: 'link-1', parentId: 'parent-1', studentId: 'student-1' });
    testResponse.findMany.mockResolvedValue([]);
    testAttempt.count.mockResolvedValue(0);
    studentProgress.findMany.mockResolvedValue([]);
    intervention.findMany.mockResolvedValue([]);
    attendanceRecord.findMany.mockResolvedValue([]);
    testAttempt.findMany.mockResolvedValue([]);
    testAttempt.groupBy.mockResolvedValue([]);
    batchEnrollment.findMany.mockResolvedValue([]);
    test.findMany.mockResolvedValue([]);
  });

  it('rejects non-parent roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { GET } = await import('./route');
    const response = await GET(get());
    expect(response.status).toBe(401);
  });

  it('rejects a missing studentId', async () => {
    const { GET } = await import('./route');
    const response = await GET(get(''));
    expect(response.status).toBe(400);
  });

  it("rejects a studentId not linked to this parent's account", async () => {
    parentLink.findFirst.mockResolvedValue(null);
    const { GET } = await import('./route');
    const response = await GET(get());
    expect(response.status).toBe(403);
  });

  it('sums weekly time spent from TestResponse.timeSpent, converted to minutes', async () => {
    // First call is the weekly-time query; the second (teacher comments)
    // keeps the beforeEach default of [] once this one-shot value is used.
    testResponse.findMany.mockResolvedValueOnce([{ timeSpent: 90 }, { timeSpent: 30 }]);
    const { GET } = await import('./route');
    const body = await (await GET(get())).json();
    expect(body.stats.weeklyTimeSpentMinutes).toBe(2); // 120s / 60 = 2min
    expect(testResponse.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ attempt: expect.objectContaining({ userId: 'student-1' }) }),
    }));
  });

  it('buckets strengths and risks via masteryBand thresholds', async () => {
    studentProgress.findMany.mockResolvedValue([
      { topic: 'Algebra', masteryScore: 20 },  // needs_support -> risk
      { topic: 'Geometry', masteryScore: 80 }, // secure -> strength
      { topic: 'Calculus', masteryScore: 55 }, // developing
    ]);
    const { GET } = await import('./route');
    const body = await (await GET(get())).json();
    expect(body.stats.risks).toEqual(['Algebra']);
    expect(body.stats.strengths).toEqual(['Geometry']);
    expect(body.stats.developing).toEqual(['Calculus']);
  });

  it('merges test-response and intervention teacher comments, sorted most-recent-first', async () => {
    testResponse.findMany.mockResolvedValue([
      { teacherFeedback: 'Good work', reviewedAt: new Date('2026-01-01'), attempt: { test: { title: 'Algebra Test' } } },
    ]);
    intervention.findMany.mockResolvedValue([
      { id: 'iv-1', title: 'Extra practice', outcomeNotes: 'Improved a lot', updatedAt: new Date('2026-01-05') },
    ]);
    const { GET } = await import('./route');
    const body = await (await GET(get())).json();
    expect(body.stats.teacherComments).toHaveLength(2);
    expect(body.stats.teacherComments[0].comment).toBe('Improved a lot'); // more recent
    expect(body.stats.teacherComments[1].comment).toBe('Good work');
  });

  it('computes attendance percent from PRESENT ratio, null when no records', async () => {
    attendanceRecord.findMany.mockResolvedValue([{ status: 'PRESENT' }, { status: 'PRESENT' }, { status: 'ABSENT' }]);
    const { GET } = await import('./route');
    const body = await (await GET(get())).json();
    expect(body.stats.attendancePercent).toBe(67);
  });

  it('computes rank via a batched groupBy, not a per-peer query', async () => {
    batchEnrollment.findMany.mockResolvedValue([{ batchId: 'batch-1' }]);
    // Second call (peers lookup) returns distinct approved students
    batchEnrollment.findMany.mockResolvedValueOnce([{ batchId: 'batch-1' }]).mockResolvedValueOnce([
      { studentId: 'student-1' }, { studentId: 'student-2' }, { studentId: 'student-3' },
    ]);
    testAttempt.groupBy.mockResolvedValue([
      { userId: 'student-1', _avg: { totalScore: 50 } },
      { userId: 'student-2', _avg: { totalScore: 80 } },
      { userId: 'student-3', _avg: { totalScore: 30 } },
    ]);
    const { GET } = await import('./route');
    const body = await (await GET(get())).json();
    // student-1 (score 50) has 1 peer better (student-2, 80) out of 3 -> (3-1)/3*100 = 67
    expect(body.stats.globalRank).toBe(67);
    expect(testAttempt.groupBy).toHaveBeenCalledTimes(1);
  });

  it('builds recent scores with a batched test-average lookup instead of per-attempt queries', async () => {
    testAttempt.findMany.mockResolvedValue([
      { testId: 'test-1', totalScore: 80, endTime: new Date('2026-01-10'), startTime: new Date('2026-01-10') },
    ]);
    testAttempt.groupBy.mockResolvedValue([{ testId: 'test-1', _avg: { totalScore: 65 } }]);
    test.findMany.mockResolvedValue([{ id: 'test-1', title: 'Mock Exam' }]);
    const { GET } = await import('./route');
    const body = await (await GET(get())).json();
    expect(body.stats.recentScores).toEqual([
      { test: 'Mock Exam', score: 80, avg: 65, date: expect.any(String) },
    ]);
  });
});
