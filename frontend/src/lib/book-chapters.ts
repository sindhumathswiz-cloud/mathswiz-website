import prisma from './prisma';

/**
 * Finds the BookChapter row for a detected topic name, or creates a
 * lightweight one on the fly (name + an auto-incrementing orderIndex; no
 * page range — that still needs a manual chapter-mapping pass, which is out
 * of scope for now). This is what turns the LLM's per-question "topic" guess
 * into a real `Question.bookChapterId` link instead of just free text.
 */
export async function findOrCreateBookChapter(bookId: string, name: string, cache: Map<string, string>): Promise<string | null> {
  const key = name.trim();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;

  const existing = await prisma.bookChapter.findFirst({ where: { bookId, name: key }, select: { id: true } });
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  const maxOrder = await prisma.bookChapter.aggregate({ where: { bookId }, _max: { orderIndex: true } });
  const orderIndex = (maxOrder._max.orderIndex ?? 0) + 1;
  try {
    const created = await prisma.bookChapter.create({ data: { bookId, name: key, orderIndex } });
    cache.set(key, created.id);
    return created.id;
  } catch {
    // Unique constraint race — a concurrent extraction batch created this
    // chapter (or claimed this orderIndex) first. Re-fetch by name rather
    // than failing the whole page over a chapter that now exists.
    const retried = await prisma.bookChapter.findFirst({ where: { bookId, name: key }, select: { id: true } });
    if (retried) {
      cache.set(key, retried.id);
      return retried.id;
    }
    return null;
  }
}
