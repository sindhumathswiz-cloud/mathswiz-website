import { beforeEach, describe, expect, it, vi } from 'vitest';

const user = { findUnique: vi.fn() };
vi.mock('@/lib/prisma', () => ({ default: { user } }));

const load = () => import('./teacher-api-guard');
const session = (role: string) => ({ user: { id: 'u-1', role } });

describe('teacher-api-guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    user.findUnique.mockResolvedValue({ subscription: 'PREMIUM' });
  });

  it('requireTeacherOrAdmin: 401 without a session, 403 for wrong role, ok for TEACHER/ADMIN', async () => {
    const { requireTeacherOrAdmin } = await load();
    const none = requireTeacherOrAdmin(null);
    expect(none.ok === false && none.response.status).toBe(401);
    const student = requireTeacherOrAdmin(session('STUDENT'));
    expect(student.ok === false && student.response.status).toBe(403);
    expect(requireTeacherOrAdmin(session('TEACHER')).ok).toBe(true);
    expect(requireTeacherOrAdmin(session('ADMIN')).ok).toBe(true);
  });

  it('requirePremiumTeacher: rejects a free teacher with 403', async () => {
    const { requirePremiumTeacher } = await load();
    user.findUnique.mockResolvedValue({ subscription: 'FREE' });
    const result = await requirePremiumTeacher(session('TEACHER'));
    expect(result.ok === false && result.response.status).toBe(403);
  });

  it('requirePremiumTeacher: allows a premium teacher and exempts ADMIN without a lookup', async () => {
    const { requirePremiumTeacher } = await load();
    expect((await requirePremiumTeacher(session('TEACHER'))).ok).toBe(true);
    user.findUnique.mockClear();
    expect((await requirePremiumTeacher(session('ADMIN'))).ok).toBe(true);
    expect(user.findUnique).not.toHaveBeenCalled();
  });

  it('requirePremiumTeacherStrict: rejects ADMIN and free teachers, allows premium teachers', async () => {
    const { requirePremiumTeacherStrict } = await load();
    const admin = await requirePremiumTeacherStrict(session('ADMIN'));
    expect(admin.ok === false && admin.response.status).toBe(401);
    user.findUnique.mockResolvedValue({ subscription: 'FREE' });
    const free = await requirePremiumTeacherStrict(session('TEACHER'));
    expect(free.ok === false && free.response.status).toBe(403);
    user.findUnique.mockResolvedValue({ subscription: 'PREMIUM' });
    expect((await requirePremiumTeacherStrict(session('TEACHER'))).ok).toBe(true);
  });
});
