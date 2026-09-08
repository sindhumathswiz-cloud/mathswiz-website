CREATE TYPE "HomeworkReviewStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'REVIEWED');

ALTER TABLE "TestResponse"
ADD COLUMN "reviewStatus" "HomeworkReviewStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN "teacherFeedback" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedById" TEXT;

ALTER TABLE "TestResponse"
ADD CONSTRAINT "TestResponse_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TestResponse_reviewStatus_reviewedAt_idx"
ON "TestResponse"("reviewStatus", "reviewedAt");
