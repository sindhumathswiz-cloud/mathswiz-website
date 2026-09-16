-- CreateEnum
CREATE TYPE "TestTemplateType" AS ENUM ('WORKSHEET', 'REVISION_PACK', 'MOCK_EXAM', 'HOMEWORK_TEMPLATE');

-- AlterTable
ALTER TABLE "Intervention" ADD COLUMN     "testAssignmentId" TEXT;

-- AlterTable
ALTER TABLE "Test" ADD COLUMN     "templateType" "TestTemplateType";

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_testAssignmentId_fkey" FOREIGN KEY ("testAssignmentId") REFERENCES "TestAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
