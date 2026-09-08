CREATE TYPE "AssignmentKind" AS ENUM ('TEST', 'HOMEWORK');

ALTER TABLE "TestAssignment"
ADD COLUMN "kind" "AssignmentKind" NOT NULL DEFAULT 'TEST',
ADD COLUMN "instructions" TEXT;

CREATE INDEX "TestAssignment_kind_deadline_idx"
ON "TestAssignment"("kind", "deadline");
