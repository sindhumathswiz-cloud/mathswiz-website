-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_parentId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "parentId";
