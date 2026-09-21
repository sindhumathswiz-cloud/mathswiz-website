-- CreateTable
CREATE TABLE "SpacedRepetitionCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT,
    "flashcardId" TEXT,
    "easinessFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpacedRepetitionCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpacedRepetitionCard_userId_dueAt_idx" ON "SpacedRepetitionCard"("userId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "SpacedRepetitionCard_userId_questionId_key" ON "SpacedRepetitionCard"("userId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "SpacedRepetitionCard_userId_flashcardId_key" ON "SpacedRepetitionCard"("userId", "flashcardId");

-- AddForeignKey
ALTER TABLE "SpacedRepetitionCard" ADD CONSTRAINT "SpacedRepetitionCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpacedRepetitionCard" ADD CONSTRAINT "SpacedRepetitionCard_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpacedRepetitionCard" ADD CONSTRAINT "SpacedRepetitionCard_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "StudentFlashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A card must be exactly one of a question review or a flashcard review,
-- never both, never neither. Hand-added -- not part of Prisma's own
-- generated diff/introspection for this schema style.
ALTER TABLE "SpacedRepetitionCard" ADD CONSTRAINT "SpacedRepetitionCard_exactly_one_target"
  CHECK ((("questionId" IS NOT NULL))::int + (("flashcardId" IS NOT NULL))::int = 1);
