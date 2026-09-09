import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

async function main() {
  const { default: prisma } = await import('../src/lib/prisma');
  const expected = ['Course', 'CourseEnrollment', 'CourseLesson', 'CourseModule', 'LessonProgress'];
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('Course', 'CourseEnrollment', 'CourseLesson', 'CourseModule', 'LessonProgress')
    ORDER BY table_name
  `;
  const tables = rows.map((row) => row.table_name);
  const counts = {
    courses: await prisma.course.count(),
    enrollments: await prisma.courseEnrollment.count(),
    lessons: await prisma.courseLesson.count(),
  };
  const ready = JSON.stringify(tables) === JSON.stringify(expected);
  console.log(JSON.stringify({ ready, tables, counts }));
  await prisma.$disconnect();
  if (!ready) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
