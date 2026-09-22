-- CreateEnum
CREATE TYPE "ClassChallengeMetric" AS ENUM ('MOST_PRACTICE', 'MASTERY_GAIN', 'POINTS_EARNED');

-- CreateEnum
CREATE TYPE "ClassChallengeStatus" AS ENUM ('ACTIVE', 'ENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ClassChallenge" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "metric" "ClassChallengeMetric" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "ClassChallengeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassChallenge_batchId_status_idx" ON "ClassChallenge"("batchId", "status");

-- AddForeignKey
ALTER TABLE "ClassChallenge" ADD CONSTRAINT "ClassChallenge_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassChallenge" ADD CONSTRAINT "ClassChallenge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
