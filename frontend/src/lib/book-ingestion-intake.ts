import prisma from '@/lib/prisma';
import { activeBookStorageBackend, hasPdfSignature, pdfHash, removePrivateBookPdf, storePrivateBookPdf } from '@/lib/book-storage';

export class DuplicateBookPdfError extends Error {
  constructor(public readonly duplicate: { id: string; status: string; stage: string }) {
    super('This exact PDF is already registered for the book');
  }
}

/**
 * The common "a whole PDF buffer is ready, make it a registered
 * BookIngestionRun" tail shared by the original single-request upload route
 * and the new chunked-upload finalize route, so the two paths can't drift
 * out of sync on validation/storage/record-creation behavior. Everything
 * before this point (collecting the bytes) is the only part that differs
 * between the two.
 */
export async function registerBookPdf(input: {
  bookId: string;
  book: { title: string; className: string; subject: string };
  adminId: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  buffer: Buffer;
}) {
  const { bookId, book, adminId, fileName, fileSize, mimeType, buffer } = input;

  if (!hasPdfSignature(buffer)) throw new Error('The file does not contain a valid PDF signature');
  const hash = pdfHash(buffer);

  const duplicate = await prisma.bookIngestionRun.findUnique({
    where: { bookId_fileHash: { bookId, fileHash: hash } },
    select: { id: true, status: true, stage: true },
  });
  if (duplicate) throw new DuplicateBookPdfError(duplicate);

  let storedPath: string | null = null;
  try {
    storedPath = await storePrivateBookPdf(bookId, hash, buffer);
    return await prisma.$transaction(async (tx) => {
      const sourceDocument = await tx.sourceDocument.create({
        data: { title: `${book.title} - ${fileName}`, sourceType: 'PDF', documentCategory: 'QUESTION_PAPER', filePath: storedPath, bookId, fileHash: hash, className: book.className, subject: book.subject, ingestedBy: adminId },
      });
      const ingestionRun = await tx.bookIngestionRun.create({
        data: { bookId, userId: adminId, sourceDocumentId: sourceDocument.id, fileName: fileName.slice(0, 255), fileHash: hash, storagePath: storedPath, stage: 'STORED', providerConfig: { storage: activeBookStorageBackend(), bytes: fileSize, mimeType: mimeType || 'application/pdf' }, progress: 2 },
      });
      return { sourceDocument, ingestionRun, fileHash: hash };
    });
  } catch (error) {
    if (storedPath) await removePrivateBookPdf(storedPath).catch(() => undefined);
    throw error;
  }
}
