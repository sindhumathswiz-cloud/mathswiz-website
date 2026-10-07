import type { Prisma } from '@prisma/client';

/**
 * Which written answers a teacher may mark: those on homework they set or teach,
 * and those on a mock exam they own or teach (a paper with written sections has to
 * be marked by someone, or the student's total stays incomplete).
 */
export function markableTestsFor(teacherId: string): Prisma.TestWhereInput {
  const mine: Prisma.TestAssignmentWhereInput[] = [{ batch: { teacherId } }, { test: { createdById: teacherId } }];
  return {
    OR: [
      { assignments: { some: { kind: 'HOMEWORK', OR: mine } } },
      { templateType: 'MOCK_EXAM', assignments: { some: { OR: mine } } },
    ],
  };
}
