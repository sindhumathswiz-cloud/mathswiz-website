import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const intervention = { findFirst: vi.fn(), update: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { intervention } }));

describe('student intervention progress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
  });

  it('starts the signed-in students own assigned intervention', async () => {
    intervention.findFirst.mockResolvedValue({ id: 'intervention-1' });
    intervention.update.mockResolvedValue({ id: 'intervention-1', status: 'IN_PROGRESS' });
    const { PATCH } = await import('./route');
    const response = await PATCH(new Request('http://localhost'), { params: Promise.resolve({ id: 'intervention-1' }) });

    expect(response.status).toBe(200);
    expect(intervention.findFirst).toHaveBeenCalledWith({
      where: { id: 'intervention-1', studentId: 'student-1', status: 'ASSIGNED' }, select: { id: true },
    });
    expect(intervention.update).toHaveBeenCalledWith({ where: { id: 'intervention-1' }, data: { status: 'IN_PROGRESS' } });
  });

  it('does not expose or update another students intervention', async () => {
    intervention.findFirst.mockResolvedValue(null);
    const { PATCH } = await import('./route');
    const response = await PATCH(new Request('http://localhost'), { params: Promise.resolve({ id: 'intervention-2' }) });

    expect(response.status).toBe(404);
    expect(intervention.update).not.toHaveBeenCalled();
  });
});
