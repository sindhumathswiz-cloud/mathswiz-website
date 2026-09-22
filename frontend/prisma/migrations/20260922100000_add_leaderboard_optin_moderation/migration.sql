-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "leaderboardEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "BatchEnrollment" ADD COLUMN     "excludedFromRankings" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "leaderboardOptIn" BOOLEAN NOT NULL DEFAULT false;
