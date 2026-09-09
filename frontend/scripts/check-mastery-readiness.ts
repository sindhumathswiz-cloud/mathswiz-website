import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

async function main() {
  const { default: prisma } = await import('../src/lib/prisma');
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'MasteryEvent'
  `;
  const [eventCount, progressCount] = await Promise.all([prisma.masteryEvent.count(), prisma.studentProgress.count()]);
  const ready = tables.length === 1;
  console.log(JSON.stringify({ ready, masteryEvents: eventCount, currentProgressRows: progressCount }));
  await prisma.$disconnect();
  if (!ready) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
