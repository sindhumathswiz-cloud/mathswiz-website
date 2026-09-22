import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const revalidatePath = vi.fn();
const recordAuditLog = vi.fn();
const user = { findFirst: vi.fn() };
const parentLink = { findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { user, parentLink } }));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog }));

describe('linkStudentAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'parent-1', role: 'PARENT' } });
    user.findFirst.mockResolvedValue({ id: 'student-1', email: 'kid@example.com', role: 'STUDENT' });
    parentLink.findFirst.mockResolvedValue(null);
    parentLink.create.mockResolvedValue({ id: 'link-1' });
  });

  it('rejects a caller who is not the parent in the session', async () => {
    const { linkStudentAction } = await import('./parentActions');
    await expect(linkStudentAction('someone-else', 'kid@example.com')).rejects.toThrow('Unauthorized');
    expect(parentLink.create).not.toHaveBeenCalled();
  });

  it('rejects a non-existent student email', async () => {
    user.findFirst.mockResolvedValue(null);
    const { linkStudentAction } = await import('./parentActions');
    await expect(linkStudentAction('parent-1', 'nope@example.com')).rejects.toThrow('not found');
  });

  it('rejects re-linking a student already linked to THIS parent', async () => {
    parentLink.findFirst.mockResolvedValue({ id: 'existing-link', parentId: 'parent-1', studentId: 'student-1' });
    const { linkStudentAction } = await import('./parentActions');
    await expect(linkStudentAction('parent-1', 'kid@example.com')).rejects.toThrow('already linked');
    expect(parentLink.create).not.toHaveBeenCalled();
  });

  it('allows a second, different parent to link a student already linked to another parent (two-parent households)', async () => {
    // findFirst is scoped to {studentId, parentId: session.user.id} -- a link
    // held by a DIFFERENT parent must not surface here.
    parentLink.findFirst.mockImplementation(async ({ where }: any) =>
      where.parentId === 'parent-1' ? null : { id: 'other-link', parentId: 'other-parent', studentId: 'student-1' }
    );
    const { linkStudentAction } = await import('./parentActions');
    await linkStudentAction('parent-1', 'kid@example.com');

    expect(parentLink.create).toHaveBeenCalledWith({ data: { parentId: 'parent-1', studentId: 'student-1' } });
  });

  it('creates a ParentLink row and audit-logs the link', async () => {
    const { linkStudentAction } = await import('./parentActions');
    await linkStudentAction('parent-1', 'kid@example.com');

    expect(parentLink.create).toHaveBeenCalledWith({ data: { parentId: 'parent-1', studentId: 'student-1' } });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'PARENT_STUDENT_LINKED', entityId: 'student-1' }));
    expect(revalidatePath).toHaveBeenCalledWith('/parent/dashboard');
  });
});

describe('unlinkStudentAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'parent-1', role: 'PARENT' } });
  });

  it('rejects non-parent sessions', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { unlinkStudentAction } = await import('./parentActions');
    await expect(unlinkStudentAction('student-1')).rejects.toThrow('Unauthorized');
  });

  it('throws when no matching link exists for this parent/student pair', async () => {
    parentLink.deleteMany.mockResolvedValue({ count: 0 });
    const { unlinkStudentAction } = await import('./parentActions');
    await expect(unlinkStudentAction('student-1')).rejects.toThrow('not linked');
  });

  it('deletes the ParentLink row scoped to this parent, and audit-logs it', async () => {
    parentLink.deleteMany.mockResolvedValue({ count: 1 });
    const { unlinkStudentAction } = await import('./parentActions');
    await unlinkStudentAction('student-1');

    expect(parentLink.deleteMany).toHaveBeenCalledWith({ where: { studentId: 'student-1', parentId: 'parent-1' } });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'PARENT_STUDENT_UNLINKED', entityId: 'student-1' }));
  });
});
