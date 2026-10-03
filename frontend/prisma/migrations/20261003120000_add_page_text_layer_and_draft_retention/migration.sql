-- Page-faithful source viewer + 60-day draft retention for extracted book
-- pages. Applied directly against the dev database (not via `prisma migrate
-- dev`) for the same pre-existing shadow-database reason as
-- 20260923153200_add_question_flag; the unrelated drift `migrate diff` reports
-- (IngestionJob.metadata/pdfId, User.otp/otpExpiry, one index rename) is
-- intentionally NOT included here.

-- AlterTable
ALTER TABLE "DocumentPage" ADD COLUMN "textLayer" JSONB;

-- AlterTable
ALTER TABLE "BookIngestionRun" ADD COLUMN "draftExpiresAt" TIMESTAMP(3);
ALTER TABLE "BookIngestionRun" ADD COLUMN "draftPurgedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "BookIngestionRun_draftExpiresAt_idx" ON "BookIngestionRun"("draftExpiresAt");

-- Runs that already hold extracted pages start their 60 days now, so enabling
-- retention never purges existing work on the first sweep.
UPDATE "BookIngestionRun" SET "draftExpiresAt" = NOW() + INTERVAL '60 days'
WHERE "sourceDocumentId" IS NOT NULL AND "draftExpiresAt" IS NULL;
