// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const studentSmartbookAccess = vi.fn();
const smartbookPageImagePath = vi.fn();
const readPrivateImage = vi.fn();

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/smartbook-data', () => ({ studentSmartbookAccess, smartbookPageImagePath }));
vi.mock('@/lib/book-storage', () => ({ assertPrivateImageReference: (p: string) => p, readPrivateImage }));

const get = async (page = '244') => {
  const { GET } = await import('./route');
  return (await GET(new Request(`http://localhost/api/student/smartbook/b1/pages/${page}`), { params: Promise.resolve({ bookId: 'b1', pageNumber: page }) })) as Response;
};

describe('GET /api/student/smartbook/[bookId]/pages/[pageNumber]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 's1', role: 'STUDENT' } });
    studentSmartbookAccess.mockResolvedValue({ premium: true, className: 'Class 12' });
    smartbookPageImagePath.mockResolvedValue('books/b1/page-244.jpg');
    readPrivateImage.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it('streams the page for a Premium student of the book\'s class', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(smartbookPageImagePath).toHaveBeenCalledWith('b1', 244, 'Class 12');
  });

  it('refuses a page outside the book\'s exercises, another class\'s book, or an unpublished one', async () => {
    smartbookPageImagePath.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });

  it('refuses free students and nonsense page numbers', async () => {
    studentSmartbookAccess.mockResolvedValue({ premium: false, className: 'Class 12' });
    expect((await get()).status).toBe(403);
    studentSmartbookAccess.mockResolvedValue({ premium: true, className: 'Class 12' });
    expect((await get('0')).status).toBe(400);
    expect((await get('abc')).status).toBe(400);
  });
});
