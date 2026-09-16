import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const selectQuestionsByFilters = vi.fn();

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/question-selection', () => ({ selectQuestionsByFilters }));

function post(body: unknown) {
  return new Request('http://localhost/api/teacher/tests/generate-blueprint', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/teacher/tests/generate-blueprint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    process.env.GROQ_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ filters: [{ topic: 'Algebra', count: 3 }] }) } }],
      }),
    }));
  });

  it('rejects unauthenticated callers', async () => {
    getServerSession.mockResolvedValue(null);
    const { POST } = await import('./route');
    const response = await POST(post({ prompt: 'make a test' }));
    expect(response.status).toBe(401);
    expect(selectQuestionsByFilters).not.toHaveBeenCalled();
  });

  it('rejects non-teacher/admin roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    const { POST } = await import('./route');
    const response = await POST(post({ prompt: 'make a test' }));
    expect(response.status).toBe(403);
    expect(selectQuestionsByFilters).not.toHaveBeenCalled();
  });

  it('rejects a missing prompt', async () => {
    const { POST } = await import('./route');
    const response = await POST(post({}));
    expect(response.status).toBe(400);
  });

  it('parses the AI filters and delegates question selection to the shared lib', async () => {
    selectQuestionsByFilters.mockResolvedValue([{ id: 'q-1' }, { id: 'q-2' }]);
    const { POST } = await import('./route');
    const response = await POST(post({ prompt: 'Give me 3 algebra questions' }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.questions).toHaveLength(2);
    expect(selectQuestionsByFilters).toHaveBeenCalledWith([{ topic: 'Algebra', count: 3 }]);
  });
});
