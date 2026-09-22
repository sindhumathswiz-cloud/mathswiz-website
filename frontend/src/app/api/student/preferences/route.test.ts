import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const user = { update: vi.fn(), findUnique: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { user } }));

function patch(body: unknown) {
  return new Request('http://localhost/api/student/preferences', { method: 'PATCH', body: JSON.stringify(body) });
}

describe('GET /api/student/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
  });

  it('rejects non-student roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { GET } = await import('./route');
    expect(((await GET()) as Response).status).toBe(401);
  });

  it("returns the caller's own leaderboardOptIn value", async () => {
    user.findUnique.mockResolvedValue({ leaderboardOptIn: true });
    const { GET } = await import('./route');
    const body = await (await GET()).json();
    expect(body).toEqual({ leaderboardOptIn: true });
    expect(user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'student-1' } }));
  });

  it('defaults to false when the field is somehow missing', async () => {
    user.findUnique.mockResolvedValue(null);
    const { GET } = await import('./route');
    const body = await (await GET()).json();
    expect(body).toEqual({ leaderboardOptIn: false });
  });
});

describe('PATCH /api/student/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    user.update.mockResolvedValue({ id: 'student-1', leaderboardOptIn: true });
  });

  it('rejects non-student roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ leaderboardOptIn: true }));
    expect(response.status).toBe(401);
  });

  it('rejects a non-boolean leaderboardOptIn', async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ leaderboardOptIn: 'true' }));
    expect(response.status).toBe(400);
  });

  it("updates only the caller's own row", async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ leaderboardOptIn: true }));
    expect(response.status).toBe(200);
    expect(user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'student-1' }, data: { leaderboardOptIn: true } }));
  });
});
