import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

async function main() {
  const { default: prisma } = await import('../src/lib/prisma');
  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'TestAssignment'
      AND column_name IN ('kind', 'instructions')
    ORDER BY column_name
  `;
  const assignmentCount = await prisma.testAssignment.count({ where: { kind: 'HOMEWORK' } });
  const reviewColumns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'TestResponse'
      AND column_name IN ('reviewStatus', 'teacherFeedback', 'reviewedAt', 'reviewedById')
    ORDER BY column_name
  `;
  const assignmentReady = columns.map((column) => column.column_name).join(',') === 'instructions,kind';
  const reviewReady = reviewColumns.length === 4;
  const ready = assignmentReady && reviewReady;
  console.log(JSON.stringify({ ready, columns: columns.map((column) => column.column_name), reviewColumns: reviewColumns.map((column) => column.column_name), homeworkAssignments: assignmentCount }));
  await prisma.$disconnect();
  if (!ready) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
