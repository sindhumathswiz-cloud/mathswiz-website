CREATE TABLE "PageExtractionBenchmark" (
    "id" TEXT NOT NULL,
    "ingestionRunId" TEXT NOT NULL,
    "documentPageId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "latencyMs" INTEGER,
    "rawOutput" JSONB,
    "structuredData" JSONB,
    "metrics" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PageExtractionBenchmark_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageExtractionBenchmark_documentPageId_provider_promptVersion_key" ON "PageExtractionBenchmark"("documentPageId", "provider", "promptVersion");
CREATE INDEX "PageExtractionBenchmark_ingestionRunId_provider_status_idx" ON "PageExtractionBenchmark"("ingestionRunId", "provider", "status");
ALTER TABLE "PageExtractionBenchmark" ADD CONSTRAINT "PageExtractionBenchmark_ingestionRunId_fkey" FOREIGN KEY ("ingestionRunId") REFERENCES "BookIngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PageExtractionBenchmark" ADD CONSTRAINT "PageExtractionBenchmark_documentPageId_fkey" FOREIGN KEY ("documentPageId") REFERENCES "DocumentPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
