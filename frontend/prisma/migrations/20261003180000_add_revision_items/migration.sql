-- Book revision content: definitions, theorems and formulas saved from an
-- ingested chapter so they can feed revision sheets and flashcards. Applied
-- directly against the dev database (not via `prisma migrate dev`) for the same
-- pre-existing shadow-database reason as 20260923153200_add_question_flag; the
-- unrelated drift `migrate diff` reports is intentionally NOT included here.

-- CreateEnum
CREATE TYPE "RevisionItemKind" AS ENUM ('DEFINITION', 'THEOREM', 'FORMULA', 'PROPERTY', 'KEY_POINT');

-- CreateEnum
CREATE TYPE "RevisionItemStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "RevisionItem" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "kind" "RevisionItemKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sourcePage" INTEGER NOT NULL,
    "verbatimScore" DOUBLE PRECISION,
    "status" "RevisionItemStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewNotes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevisionItem_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "StudentFlashcard" ADD COLUMN "revisionItemId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RevisionItem_chapterId_contentHash_key" ON "RevisionItem"("chapterId", "contentHash");

-- CreateIndex
CREATE INDEX "RevisionItem_chapterId_status_orderIndex_idx" ON "RevisionItem"("chapterId", "status", "orderIndex");

-- CreateIndex
CREATE INDEX "RevisionItem_bookId_status_idx" ON "RevisionItem"("bookId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StudentFlashcard_userId_revisionItemId_key" ON "StudentFlashcard"("userId", "revisionItemId");

-- AddForeignKey
ALTER TABLE "RevisionItem" ADD CONSTRAINT "RevisionItem_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionItem" ADD CONSTRAINT "RevisionItem_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "BookChapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFlashcard" ADD CONSTRAINT "StudentFlashcard_revisionItemId_fkey" FOREIGN KEY ("revisionItemId") REFERENCES "RevisionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
