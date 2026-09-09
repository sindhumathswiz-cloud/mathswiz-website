import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

async function main() {
  const { default: prisma } = await import('../src/lib/prisma');
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Intervention'
  `;
  const interventionCount = await prisma.intervention.count();
  const ready = tables.length === 1;
  console.log(JSON.stringify({ ready, interventions: interventionCount }));
  await prisma.$disconnect();
  if (!ready) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
