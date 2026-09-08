CREATE TYPE "BookIngestionStage" AS ENUM ('REGISTERED', 'STORED', 'LAYOUT_ANALYSIS', 'BOOK_MAPPING', 'QUESTION_INVENTORY', 'QUESTION_EXTRACTION', 'SOLUTION_MATCHING', 'VERIFICATION', 'REVIEW_READY', 'COMPLETED');
CREATE TYPE "QuestionVerificationStatus" AS ENUM ('UNVERIFIED', 'STRUCTURALLY_VALID', 'ANSWER_MATCHED', 'SOLUTION_MATCHED', 'MATHEMATICALLY_VERIFIED', 'NEEDS_REVIEW', 'VERIFIED');

CREATE TABLE "Book" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "author" TEXT,
  "publisher" TEXT,
  "edition" TEXT,
  "publicationYear" INTEGER,
  "isbn" TEXT,
  "board" TEXT,
  "className" TEXT NOT NULL,
  "subject" TEXT NOT NULL DEFAULT 'Mathematics',
  "language" TEXT NOT NULL DEFAULT 'English',
  "description" TEXT,
  "coverImageUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookChapter" (
  "id" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "chapterNumber" TEXT,
  "name" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "startPage" INTEGER,
  "endPage" INTEGER,
  "topic" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookChapter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookExercise" (
  "id" TEXT NOT NULL,
  "chapterId" TEXT NOT NULL,
  "code" TEXT,
  "title" TEXT,
  "sectionType" TEXT,
  "orderIndex" INTEGER NOT NULL,
  "startPage" INTEGER,
  "endPage" INTEGER,
  "expectedQuestionCount" INTEGER,
  "extractedQuestionCount" INTEGER NOT NULL DEFAULT 0,
  "unresolvedQuestionCount" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookExercise_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookIngestionRun" (
  "id" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceDocumentId" TEXT,
  "fileName" TEXT NOT NULL,
  "fileHash" TEXT NOT NULL,
  "storagePath" TEXT,
  "status" "ExtractionStatus" NOT NULL DEFAULT 'PENDING',
  "stage" "BookIngestionStage" NOT NULL DEFAULT 'REGISTERED',
  "providerConfig" JSONB,
  "totalPages" INTEGER,
  "processedPages" INTEGER NOT NULL DEFAULT 0,
  "expectedQuestions" INTEGER,
  "extractedQuestions" INTEGER NOT NULL DEFAULT 0,
  "matchedSolutions" INTEGER NOT NULL DEFAULT 0,
  "verifiedQuestions" INTEGER NOT NULL DEFAULT 0,
  "reviewRequired" INTEGER NOT NULL DEFAULT 0,
  "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookIngestionRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Question"
  ADD COLUMN "bookId" TEXT,
  ADD COLUMN "bookChapterId" TEXT,
  ADD COLUMN "bookExerciseId" TEXT,
  ADD COLUMN "printedNumber" TEXT,
  ADD COLUMN "printedSubpart" TEXT,
  ADD COLUMN "sourcePageStart" INTEGER,
  ADD COLUMN "sourcePageEnd" INTEGER,
  ADD COLUMN "sourceLocator" JSONB,
  ADD COLUMN "extractionConfidence" DOUBLE PRECISION,
  ADD COLUMN "verificationStatus" "QuestionVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "verifiedAt" TIMESTAMP(3);

ALTER TABLE "SourceDocument"
  ADD COLUMN "bookId" TEXT,
  ADD COLUMN "fileHash" TEXT;

ALTER TABLE "DocumentPage"
  ADD COLUMN "pageImageUrl" TEXT,
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER,
  ADD COLUMN "nativeText" TEXT,
  ADD COLUMN "layoutData" JSONB,
  ADD COLUMN "ocrProvider" TEXT,
  ADD COLUMN "ocrConfidence" DOUBLE PRECISION,
  ADD COLUMN "imageQualityScore" DOUBLE PRECISION;

CREATE INDEX "Book_className_subject_isActive_idx" ON "Book"("className", "subject", "isActive");
CREATE INDEX "Book_title_edition_idx" ON "Book"("title", "edition");
CREATE INDEX "Book_publisher_idx" ON "Book"("publisher");
CREATE UNIQUE INDEX "BookChapter_bookId_orderIndex_key" ON "BookChapter"("bookId", "orderIndex");
CREATE INDEX "BookChapter_bookId_chapterNumber_idx" ON "BookChapter"("bookId", "chapterNumber");
CREATE INDEX "BookChapter_topic_idx" ON "BookChapter"("topic");
CREATE UNIQUE INDEX "BookExercise_chapterId_orderIndex_key" ON "BookExercise"("chapterId", "orderIndex");
CREATE INDEX "BookExercise_chapterId_code_idx" ON "BookExercise"("chapterId", "code");
CREATE UNIQUE INDEX "BookIngestionRun_bookId_fileHash_key" ON "BookIngestionRun"("bookId", "fileHash");
CREATE INDEX "BookIngestionRun_status_stage_updatedAt_idx" ON "BookIngestionRun"("status", "stage", "updatedAt");
CREATE INDEX "BookIngestionRun_userId_createdAt_idx" ON "BookIngestionRun"("userId", "createdAt");
CREATE INDEX "Question_bookId_bookChapterId_bookExerciseId_idx" ON "Question"("bookId", "bookChapterId", "bookExerciseId");
CREATE INDEX "Question_bookExerciseId_printedNumber_printedSubpart_idx" ON "Question"("bookExerciseId", "printedNumber", "printedSubpart");
CREATE INDEX "Question_verificationStatus_status_idx" ON "Question"("verificationStatus", "status");
CREATE INDEX "SourceDocument_bookId_idx" ON "SourceDocument"("bookId");
CREATE INDEX "SourceDocument_fileHash_idx" ON "SourceDocument"("fileHash");

ALTER TABLE "Book" ADD CONSTRAINT "Book_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookChapter" ADD CONSTRAINT "BookChapter_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookExercise" ADD CONSTRAINT "BookExercise_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "BookChapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookIngestionRun" ADD CONSTRAINT "BookIngestionRun_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookIngestionRun" ADD CONSTRAINT "BookIngestionRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookIngestionRun" ADD CONSTRAINT "BookIngestionRun_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_bookChapterId_fkey" FOREIGN KEY ("bookChapterId") REFERENCES "BookChapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_bookExerciseId_fkey" FOREIGN KEY ("bookExerciseId") REFERENCES "BookExercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE SET NULL ON UPDATE CASCADE;
