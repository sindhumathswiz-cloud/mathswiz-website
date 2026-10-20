-- Staging <-> live content sync bookkeeping (used in the staging database; created on both so schemas match).
CREATE TABLE "ContentSyncLedger" (
    "tableName" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentSyncLedger_pkey" PRIMARY KEY ("tableName","rowId")
);

CREATE TABLE "ContentSyncRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "mode" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" JSONB,
    "issues" JSONB,
    "backup" JSONB,
    "error" TEXT,

    CONSTRAINT "ContentSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentSyncRun_startedAt_idx" ON "ContentSyncRun"("startedAt");
