-- The exam clock is decided on the server: when the student pressed Start, and the last
-- answers saved while it was running (used to score a submit that arrives after the deadline).
ALTER TABLE "TestAttempt" ADD COLUMN "examStartedAt" TIMESTAMP(3);
ALTER TABLE "TestAttempt" ADD COLUMN "savedResponses" JSONB;
ALTER TABLE "TestAttempt" ADD COLUMN "savedAt" TIMESTAMP(3);
