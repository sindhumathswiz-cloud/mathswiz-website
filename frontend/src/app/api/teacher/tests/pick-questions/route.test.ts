import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const selectQuestionsByFilters = vi.fn();

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/question-selection', () => ({ selectQuestionsByFilters }));

function post(body: unknown) {
  return new Request('http://localhost/api/teacher/tests/pick-questions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/teacher/tests/pick-questions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
  });

  it('rejects unauthenticated callers', async () => {
    getServerSession.mockResolvedValue(null);
    const { POST } = await import('./route');
    const response = await POST(post({ filters: [{ topic: 'Algebra', count: 5 }] }));
    expect(response.status).toBe(401);
  });

  it('rejects non-teacher/admin roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    const { POST } = await import('./route');
    const response = await POST(post({ filters: [{ topic: 'Algebra', count: 5 }] }));
    expect(response.status).toBe(403);
  });

  it('rejects an empty filter list', async () => {
    const { POST } = await import('./route');
    const response = await POST(post({ filters: [] }));
    expect(response.status).toBe(400);
    expect(selectQuestionsByFilters).not.toHaveBeenCalled();
  });

  it('delegates to the shared lib and returns its result', async () => {
    selectQuestionsByFilters.mockResolvedValue([{ id: 'q-1' }]);
    const { POST } = await import('./route');
    const filters = [{ topic: 'Algebra', difficulty: 'EASY', count: 5 }];
    const response = await POST(post({ filters }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.questions).toEqual([{ id: 'q-1' }]);
    expect(selectQuestionsByFilters).toHaveBeenCalledWith(filters);
  });
});
