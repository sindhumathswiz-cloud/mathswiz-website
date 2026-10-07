-- Mock exam patterns: a per-section "attempt any N" limit and the pattern a test
-- was built from. Applied directly against the dev database (not via `prisma
-- migrate dev`) for the same pre-existing shadow-database reason as
-- 20260923153200_add_question_flag. Both columns are nullable, so existing tests
-- are unchanged.

-- AlterTable
ALTER TABLE "Test" ADD COLUMN "examPattern" TEXT;

-- AlterTable
ALTER TABLE "TestSection" ADD COLUMN "attemptLimit" INTEGER;
