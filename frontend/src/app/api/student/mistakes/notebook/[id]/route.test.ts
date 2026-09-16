import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const mistakeNotebookEntry = { findUnique: vi.fn(), delete: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { mistakeNotebookEntry } }));

const params = (id: string) => Promise.resolve({ id });

describe('DELETE /api/student/mistakes/notebook/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
  });

  it('rejects non-student roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { DELETE } = await import('./route');
    const response = await DELETE(new Request('http://localhost'), { params: params('entry-1') });
    expect(response.status).toBe(401);
  });

  it('404s when the entry does not exist', async () => {
    mistakeNotebookEntry.findUnique.mockResolvedValue(null);
    const { DELETE } = await import('./route');
    const response = await DELETE(new Request('http://localhost'), { params: params('missing') });
    expect(response.status).toBe(404);
  });

  it('404s when the entry belongs to another student', async () => {
    mistakeNotebookEntry.findUnique.mockResolvedValue({ id: 'entry-1', userId: 'other-student' });
    const { DELETE } = await import('./route');
    const response = await DELETE(new Request('http://localhost'), { params: params('entry-1') });
    expect(response.status).toBe(404);
    expect(mistakeNotebookEntry.delete).not.toHaveBeenCalled();
  });

  it('deletes an owned entry', async () => {
    mistakeNotebookEntry.findUnique.mockResolvedValue({ id: 'entry-1', userId: 'student-1' });
    mistakeNotebookEntry.delete.mockResolvedValue({ id: 'entry-1' });
    const { DELETE } = await import('./route');
    const response = await DELETE(new Request('http://localhost'), { params: params('entry-1') });
    expect(response.status).toBe(200);
    expect(mistakeNotebookEntry.delete).toHaveBeenCalledWith({ where: { id: 'entry-1' } });
  });
});
