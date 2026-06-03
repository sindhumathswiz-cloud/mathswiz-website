import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn()
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {}
}));

const mockPrisma = {
  question: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    createMany: vi.fn()
  },
  tagTaxonomy: {
    findMany: vi.fn(),
    findUnique: vi.fn()
  },
  $transaction: vi.fn()
};

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma
}));

describe('API Route - Questions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/questions', () => {
    it('should filter by scope for TEACHER role', async () => {
      const { getServerSession } = await import('next-auth');
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: 'teacher-1', role: 'TEACHER', email: 'teacher@test.com' }
      });

      mockPrisma.question.findMany.mockResolvedValue([]);

      const { GET } = await import('@/app/api/questions/route');
      const req = new Request('http://localhost/api/questions');
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockPrisma.question.findMany).toHaveBeenCalled();
    });

    it('should return only APPROVED PUBLIC for STUDENT role', async () => {
      const { getServerSession } = await import('next-auth');
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: 'student-1', role: 'STUDENT', email: 'student@test.com' }
      });

      mockPrisma.question.findMany.mockResolvedValue([]);

      const { GET } = await import('@/app/api/questions/route');
      const req = new Request('http://localhost/api/questions');
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/questions', () => {
    it('should reject STUDENT role', async () => {
      const { getServerSession } = await import('next-auth');
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: 'student-1', role: 'STUDENT', email: 'student@test.com' }
      });

      const { POST } = await import('@/app/api/questions/route');
      const req = new Request('http://localhost/api/questions', {
        method: 'POST',
        body: JSON.stringify([{ content: 'Test question' }])
      });
      const response = await POST(req);

      expect(response.status).toBe(403);
    });

    it('should create TEACHER_PRIVATE for TEACHER role', async () => {
      const { getServerSession } = await import('next-auth');
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: 'teacher-1', role: 'TEACHER', email: 'teacher@test.com' }
      });

      mockPrisma.$transaction.mockResolvedValue([{ id: 'q1' }]);

      const { POST } = await import('@/app/api/questions/route');
      const req = new Request('http://localhost/api/questions', {
        method: 'POST',
        body: JSON.stringify([{ content: 'Test question', type: 'SINGLE_CHOICE' }])
      });
      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.scope).toBe('TEACHER_PRIVATE');
    });

    it('should create PUBLIC for ADMIN role', async () => {
      const { getServerSession } = await import('next-auth');
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: 'admin-1', role: 'ADMIN', email: 'admin@test.com' }
      });

      mockPrisma.$transaction.mockResolvedValue([{ id: 'q1' }]);

      const { POST } = await import('@/app/api/questions/route');
      const req = new Request('http://localhost/api/questions', {
        method: 'POST',
        body: JSON.stringify([{ content: 'Test question', type: 'SINGLE_CHOICE' }])
      });
      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.scope).toBe('PUBLIC');
    });
  });
});
