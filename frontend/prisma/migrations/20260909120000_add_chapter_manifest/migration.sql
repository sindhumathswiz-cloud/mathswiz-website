-- AlterTable
ALTER TABLE "BookChapter" ADD COLUMN     "manifestConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "manifestConfirmedById" TEXT;

-- AlterTable
ALTER TABLE "BookExercise" ADD COLUMN     "answerKeyStartPage" INTEGER,
ADD COLUMN     "answerKeyEndPage" INTEGER,
ADD COLUMN     "solutionsStartPage" INTEGER,
ADD COLUMN     "solutionsEndPage" INTEGER,
ADD COLUMN     "inlineAnswers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "noAnswers" BOOLEAN NOT NULL DEFAULT false;
