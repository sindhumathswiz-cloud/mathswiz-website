/**
 * Read-only: counts the questions the end-to-end suite put into the question bank, and what refers to them.
 * Changes nothing.   npx tsx scripts/audit-e2e-questions.ts
 */
import { config } from 'dotenv';
import { withDb } from '../e2e/fixtures/db';
import { E2E_ADMIN, E2E_READER_TAG, E2E_STUDENT, E2E_TEACHER } from '../e2e/fixtures/data';

config({ path: '.env.local', quiet: true });

withDb(async (prisma) => {
  const accounts = await prisma.user.findMany({
    where: { mobileNumber: { in: [E2E_TEACHER.mobileNumber, E2E_STUDENT.mobileNumber, E2E_ADMIN.mobileNumber] } },
    select: { id: true, mobileNumber: true },
  });
  const accountIds = accounts.map((a) => a.id);
  const questions = await prisma.question.findMany({
    where: { OR: [{ id: { startsWith: 'e2e-' } }, { tags: { has: E2E_READER_TAG } }, { createdById: { in: accountIds } }] },
    select: { id: true, status: true, topic: true, tags: true, createdById: true, bookId: true },
  });
  const count = (key: (q: (typeof questions)[number]) => string) => {
    const out: Record<string, number> = {};
    for (const q of questions) out[key(q)] = (out[key(q)] ?? 0) + 1;
    return out;
  };
  console.log('e2e accounts:', accounts.length, 'total e2e questions:', questions.length);
  console.log('matched by id prefix:', questions.filter((q) => q.id.startsWith('e2e-')).length,
    '| reader tag:', questions.filter((q) => q.tags.includes(E2E_READER_TAG)).length,
    '| created by an e2e account:', questions.filter((q) => q.createdById && accountIds.includes(q.createdById)).length);
  console.log('by status:', count((q) => q.status));
  console.log('by topic:', count((q) => q.topic ?? '(none)'));
  console.log('linked to a book:', questions.filter((q) => q.bookId).length);

  // Only created-by-account matches (not the fixed ids or the tag) deserve a second look.
  const others = questions.filter((q) => !q.id.startsWith('e2e-') && !q.tags.includes(E2E_READER_TAG));
  console.log('matched ONLY because an e2e account created them:', others.length, others.slice(0, 5).map((q) => `${q.id} [${q.status}] ${q.topic}`));

  const ids = questions.map((q) => q.id);
  console.log('referenced by other people:', {
    responses: await prisma.testResponse.count({ where: { questionId: { in: ids }, attempt: { userId: { notIn: accountIds } } } }),
    testSlots: await prisma.testQuestion.count({ where: { questionId: { in: ids }, section: { test: { createdById: { notIn: accountIds } } } } }),
    reviewCards: await prisma.spacedRepetitionCard.count({ where: { questionId: { in: ids }, userId: { notIn: accountIds } } }),
  });
}).catch((error) => { console.error(error); process.exit(1); });
