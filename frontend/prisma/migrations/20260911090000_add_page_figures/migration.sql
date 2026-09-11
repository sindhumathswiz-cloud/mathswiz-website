-- CreateTable
CREATE TABLE "PageFigure" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "documentPageId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "x" INTEGER,
    "y" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "imageType" TEXT NOT NULL DEFAULT 'diagram',
    "imageUrl" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "questionId" TEXT,
    "matchedAutomatically" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageFigure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageFigure_bookId_pageNumber_idx" ON "PageFigure"("bookId", "pageNumber");

-- CreateIndex
CREATE INDEX "PageFigure_documentPageId_idx" ON "PageFigure"("documentPageId");

-- CreateIndex
CREATE INDEX "PageFigure_questionId_idx" ON "PageFigure"("questionId");

-- AddForeignKey
ALTER TABLE "PageFigure" ADD CONSTRAINT "PageFigure_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageFigure" ADD CONSTRAINT "PageFigure_documentPageId_fkey" FOREIGN KEY ("documentPageId") REFERENCES "DocumentPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageFigure" ADD CONSTRAINT "PageFigure_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
