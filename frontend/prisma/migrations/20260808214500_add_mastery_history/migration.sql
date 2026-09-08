CREATE TYPE "MasterySource" AS ENUM ('PRACTICE', 'TEST', 'HOMEWORK');

CREATE TABLE "MasteryEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "source" "MasterySource" NOT NULL,
  "previousScore" INTEGER NOT NULL,
  "newScore" INTEGER NOT NULL,
  "delta" INTEGER NOT NULL,
  "isCorrect" BOOLEAN NOT NULL,
  "attemptId" TEXT,
  "questionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MasteryEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MasteryEvent_userId_topic_createdAt_idx" ON "MasteryEvent"("userId", "topic", "createdAt");
CREATE INDEX "MasteryEvent_attemptId_idx" ON "MasteryEvent"("attemptId");
ALTER TABLE "MasteryEvent" ADD CONSTRAINT "MasteryEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MasteryEvent" ADD CONSTRAINT "MasteryEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TestAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MasteryEvent" ADD CONSTRAINT "MasteryEvent_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
