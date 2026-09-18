-- CreateEnum
CREATE TYPE "QuestionProvenance" AS ENUM ('BOOK_SOURCED', 'MANUALLY_AUTHORED');

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "provenance" "QuestionProvenance" NOT NULL DEFAULT 'MANUALLY_AUTHORED';

-- Backfill: any existing question already linked to a book genuinely
-- originated from the book-ingestion pipeline, regardless of whether its
-- source page / printed number happen to be filled in yet (the acceptance
-- gate in lib/question-provenance.ts checks those separately, at approval
-- time -- this backfill is only about where the row came from). Everything
-- else keeps the column default of MANUALLY_AUTHORED, which is accurate for
-- every other existing creation path (manual bulk-import, teacher-authored,
-- RAG-generated).
UPDATE "Question" SET "provenance" = 'BOOK_SOURCED' WHERE "bookId" IS NOT NULL;
