-- AlterTable
ALTER TABLE "BookExercise" ADD COLUMN     "matchedQuestionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reconciledAt" TIMESTAMP(3);
