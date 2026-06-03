const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.questionTag.deleteMany();
  await prisma.tagTaxonomy.deleteMany();
  const c = await prisma.tagTaxonomy.count();
  console.log('Cleared. Remaining:', c);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
