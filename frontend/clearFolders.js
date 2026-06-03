require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.knowledgeDocument.deleteMany({});
  await prisma.knowledgeFolder.deleteMany({});
  console.log("Cleared folders");
}
main().catch(console.error).finally(() => prisma.$disconnect());
