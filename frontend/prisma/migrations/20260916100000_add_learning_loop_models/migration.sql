-- CreateEnum
CREATE TYPE "LearningPathStage" AS ENUM ('EXAMPLES', 'GUIDED_PRACTICE', 'TIMED_QUIZ', 'RECOVERY_PRACTICE', 'COMPLETED');

-- CreateTable
CREATE TABLE "MistakeNotebookEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MistakeNotebookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookmarkList" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookmarkList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookmarkItem" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookmarkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentFlashcard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "topic" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentFlashcard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningPathProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "stage" "LearningPathStage" NOT NULL DEFAULT 'EXAMPLES',
    "examplesViewedCount" INTEGER NOT NULL DEFAULT 0,
    "examplesViewedIds" TEXT[],
    "guidedAttempted" INTEGER NOT NULL DEFAULT 0,
    "guidedCorrect" INTEGER NOT NULL DEFAULT 0,
    "quizScore" DOUBLE PRECISION,
    "recoveryQuestionIds" TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "LearningPathProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MistakeNotebookEntry_userId_createdAt_idx" ON "MistakeNotebookEntry"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MistakeNotebookEntry_userId_questionId_key" ON "MistakeNotebookEntry"("userId", "questionId");

-- CreateIndex
CREATE INDEX "BookmarkList_userId_updatedAt_idx" ON "BookmarkList"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookmarkList_userId_name_key" ON "BookmarkList"("userId", "name");

-- CreateIndex
CREATE INDEX "BookmarkItem_listId_createdAt_idx" ON "BookmarkItem"("listId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookmarkItem_listId_questionId_key" ON "BookmarkItem"("listId", "questionId");

-- CreateIndex
CREATE INDEX "StudentFlashcard_userId_updatedAt_idx" ON "StudentFlashcard"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "StudentFlashcard_userId_topic_idx" ON "StudentFlashcard"("userId", "topic");

-- CreateIndex
CREATE INDEX "LearningPathProgress_userId_stage_idx" ON "LearningPathProgress"("userId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "LearningPathProgress_userId_topic_key" ON "LearningPathProgress"("userId", "topic");

-- AddForeignKey
ALTER TABLE "MistakeNotebookEntry" ADD CONSTRAINT "MistakeNotebookEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MistakeNotebookEntry" ADD CONSTRAINT "MistakeNotebookEntry_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookmarkList" ADD CONSTRAINT "BookmarkList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookmarkItem" ADD CONSTRAINT "BookmarkItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "BookmarkList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookmarkItem" ADD CONSTRAINT "BookmarkItem_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFlashcard" ADD CONSTRAINT "StudentFlashcard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPathProgress" ADD CONSTRAINT "LearningPathProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
