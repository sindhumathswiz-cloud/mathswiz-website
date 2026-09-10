-- AlterTable
ALTER TABLE "BookChapter" ADD COLUMN     "printedStartPage" INTEGER,
ADD COLUMN     "printedEndPage" INTEGER;

-- AlterTable
ALTER TABLE "BookExercise" ADD COLUMN     "answerKeyCoverage" TEXT,
ADD COLUMN     "solutionCoverage" TEXT;
