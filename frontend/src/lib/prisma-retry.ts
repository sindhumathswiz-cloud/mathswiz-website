import { Prisma } from '@prisma/client';

/**
 * Retries a Serializable-isolation `prisma.$transaction(...)` call on
 * Postgres write-conflict/deadlock aborts (Prisma error P2034). Postgres's
 * serializable isolation is expected to abort one side of a genuine
 * conflict rather than silently letting it corrupt data -- Prisma's own
 * docs call retrying that specific error the required pattern for
 * Serializable transactions, not an optional hardening.
 */
export async function withSerializableRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const isWriteConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
      if (!isWriteConflict || attempt >= attempts) throw error;
    }
  }
}
