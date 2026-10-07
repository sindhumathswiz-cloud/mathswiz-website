-- Internal choice: questions sharing a choiceGroup within a section are alternatives.
ALTER TABLE "TestQuestion" ADD COLUMN "choiceGroup" TEXT;

-- Photos of handwritten working attached to written answers during an exam.
CREATE TABLE "AnswerImage" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnswerImage_attemptId_questionId_idx" ON "AnswerImage"("attemptId", "questionId");

ALTER TABLE "AnswerImage" ADD CONSTRAINT "AnswerImage_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TestAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
