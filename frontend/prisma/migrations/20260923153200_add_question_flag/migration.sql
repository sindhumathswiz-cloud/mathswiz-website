-- Student-reported "flag this question as incorrect" feature. Distinct
-- from the existing tag-based AI-content-QA second-review pipeline
-- (resolve-flag route / QuestionTrustBadge), which tracks no per-reporter
-- record. Applied directly against the dev database (not via
-- `prisma migrate dev`) because the shadow database used to validate
-- migrations fails to replay pre-existing migration history
-- (20260802170000_add_audit_logs -- P1014, unrelated to this change; see
-- also 20260923140000_add_mastery_decay_source for the same workaround).
--
-- Note: `prisma migrate diff` against the live DB also surfaced unrelated
-- pre-existing drift (IngestionJob.metadata/pdfId, User.otp/otpExpiry
-- columns present in the DB but not in schema.prisma, plus one index
-- rename) -- intentionally NOT included here, since dropping those columns
-- is out of scope for this change and risks real data loss if they're
-- still in use anywhere.

-- CreateEnum
CREATE TYPE "QuestionFlagStatus" AS ENUM ('PENDING', 'CORRECTED', 'REJECTED');

-- CreateTable
CREATE TABLE "QuestionFlag" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "flaggedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "QuestionFlagStatus" NOT NULL DEFAULT 'PENDING',
    "resolution" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionFlag_questionId_idx" ON "QuestionFlag"("questionId");

-- CreateIndex
CREATE INDEX "QuestionFlag_flaggedById_createdAt_idx" ON "QuestionFlag"("flaggedById", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionFlag_status_createdAt_idx" ON "QuestionFlag"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "QuestionFlag" ADD CONSTRAINT "QuestionFlag_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionFlag" ADD CONSTRAINT "QuestionFlag_flaggedById_fkey" FOREIGN KEY ("flaggedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionFlag" ADD CONSTRAINT "QuestionFlag_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
