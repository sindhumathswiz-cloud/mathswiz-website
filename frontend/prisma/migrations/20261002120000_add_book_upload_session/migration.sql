-- Chunked/resumable book PDF upload. See BookUploadSession's doc comment in
-- schema.prisma. Applied directly against the dev database (not via
-- `prisma migrate dev`) for the same pre-existing shadow-database reason as
-- 20260923140000_add_mastery_decay_source and 20260923153200_add_question_flag
-- -- see those migrations for detail. `prisma migrate diff` against the live
-- DB again surfaced the same unrelated pre-existing drift (IngestionJob.metadata/
-- pdfId, User.otp/otpExpiry, one index rename) intentionally NOT included here.

-- CreateEnum
CREATE TYPE "BookUploadSessionStatus" AS ENUM ('IN_PROGRESS', 'FINALIZING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "BookUploadSession" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "chunkSize" INTEGER NOT NULL,
    "totalChunks" INTEGER NOT NULL,
    "receivedChunkCount" INTEGER NOT NULL DEFAULT 0,
    "bytesReceived" INTEGER NOT NULL DEFAULT 0,
    "status" "BookUploadSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "ingestionRunId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookUploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookUploadSession_bookId_createdById_status_idx" ON "BookUploadSession"("bookId", "createdById", "status");

-- CreateIndex
CREATE INDEX "BookUploadSession_status_updatedAt_idx" ON "BookUploadSession"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "BookUploadSession" ADD CONSTRAINT "BookUploadSession_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookUploadSession" ADD CONSTRAINT "BookUploadSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
