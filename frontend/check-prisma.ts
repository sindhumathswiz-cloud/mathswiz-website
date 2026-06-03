import prisma from './src/lib/prisma';

async function checkPrisma() {
  console.log('Prisma keys:', Object.keys(prisma));
  console.log('Lead:', !!(prisma as any).lead);
  console.log('Banner:', !!(prisma as any).banner);
  console.log('Notification:', !!(prisma as any).notification);
  console.log('SitePage:', !!(prisma as any).sitePage);
  process.exit(0);
}

checkPrisma().catch(err => {
  console.error(err);
  process.exit(1);
});
