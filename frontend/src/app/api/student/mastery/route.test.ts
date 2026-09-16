import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const studentProgress = { findMany: vi.fn() };
const masteryEvent = { findMany: vi.fn() };
const testResponse = { findMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { studentProgress, masteryEvent, testResponse } }));

describe('GET /api/student/mastery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    masteryEvent.findMany.mockResolvedValue([]);
  });

  it('rejects non-student roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { GET } = await import('./route');
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('computes avgTimeSeconds per topic from TestResponse history', async () => {
    studentProgress.findMany.mockResolvedValue([{ topic: 'Algebra', masteryScore: 60, currentStreak: 2 }]);
    testResponse.findMany.mockResolvedValue([
      { timeSpent: 30, question: { topic: 'Algebra' } },
      { timeSpent: 50, question: { topic: 'Algebra' } },
      { timeSpent: 100, question: { topic: 'Geometry' } },
    ]);
    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();
    expect(body.topics).toHaveLength(1);
    expect(body.topics[0].avgTimeSeconds).toBe(40);
    expect(body.topics[0].attemptsCount).toBe(2);
  });

  it('leaves avgTimeSeconds null for a topic with no TestResponse history', async () => {
    studentProgress.findMany.mockResolvedValue([{ topic: 'Trigonometry', masteryScore: 20, currentStreak: 0 }]);
    testResponse.findMany.mockResolvedValue([]);
    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();
    expect(body.topics[0].avgTimeSeconds).toBeNull();
    expect(body.topics[0].attemptsCount).toBe(0);
  });

  it('ignores a TestResponse whose question has no topic', async () => {
    studentProgress.findMany.mockResolvedValue([{ topic: 'Algebra', masteryScore: 60, currentStreak: 2 }]);
    testResponse.findMany.mockResolvedValue([
      { timeSpent: 30, question: { topic: null } },
    ]);
    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();
    expect(body.topics[0].avgTimeSeconds).toBeNull();
  });
});
