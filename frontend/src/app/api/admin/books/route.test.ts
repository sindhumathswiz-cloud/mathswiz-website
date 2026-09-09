import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();
const book = { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() };
vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { book } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

describe('Admin book catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    book.findFirst.mockResolvedValue(null);
    book.create.mockResolvedValue({ id: 'book-1', title: 'Calculus', className: 'Class 12' });
  });

  it('registers and audits a Class 11 or 12 mathematics book', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/admin/books', {
      method: 'POST', body: JSON.stringify({ title: 'Calculus', className: 'Class 12', publisher: 'Example', edition: '2026' }),
    })) as Response;
    expect(response.status).toBe(201);
    expect(book.create).toHaveBeenCalledWith({ data: expect.objectContaining({ title: 'Calculus', className: 'Class 12', subject: 'Mathematics', createdById: 'admin-1' }) });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_REGISTERED', entityId: 'book-1' }));
  });

  it('rejects unsupported class values', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/admin/books', { method: 'POST', body: JSON.stringify({ title: 'Book', className: 'Class 10' }) })) as Response;
    expect(response.status).toBe(400);
    expect(book.create).not.toHaveBeenCalled();
  });

  it('does not allow non-admin roles', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { GET } = await import('./route');
    expect(((await GET(new Request('http://localhost/api/admin/books'))) as Response).status).toBe(403);
  });
});
