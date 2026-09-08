CREATE TYPE "InterventionType" AS ENUM ('PRACTICE', 'HOMEWORK', 'LIVE_SUPPORT', 'MATERIAL', 'OTHER');
CREATE TYPE "InterventionStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TABLE "Intervention" (
  "id" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "batchId" TEXT,
  "topic" TEXT NOT NULL,
  "type" "InterventionType" NOT NULL,
  "status" "InterventionStatus" NOT NULL DEFAULT 'ASSIGNED',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "dueDate" TIMESTAMP(3),
  "outcomeNotes" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Intervention_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Intervention_teacherId_status_dueDate_idx" ON "Intervention"("teacherId", "status", "dueDate");
CREATE INDEX "Intervention_studentId_status_dueDate_idx" ON "Intervention"("studentId", "status", "dueDate");
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
