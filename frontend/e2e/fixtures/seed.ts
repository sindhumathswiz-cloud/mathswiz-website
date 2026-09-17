/**
 * Idempotent fixture seeding for the authenticated e2e suite. Run once as
 * Playwright's globalSetup (see e2e/global-setup.ts) before any spec file.
 *
 * Everything here is either upserted by a fixed id/unique key (safe to
 * re-run) or explicitly deleted-then-recreated for the handful of things
 * a spec run creates fresh each time (the teacher's Test/Intervention rows,
 * the student's LearningPathProgress) so repeated local runs don't
 * accumulate stale data or start a stateful flow mid-way through.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";
import pg from "pg";
import {
  E2E_TEACHER,
  E2E_STUDENT,
  E2E_BATCH_CODE,
  E2E_BATCH_NAME,
  WEAK_TOPIC,
  HEATMAP_TOPIC,
  LEARNING_PATH_TOPIC,
  MISTAKES_TOPIC,
  LEARNING_PATH_QUESTIONS,
  WEAK_TOPIC_QUESTIONS,
  HEATMAP_QUESTIONS,
  BUILDER_QUESTIONS,
  MISTAKES_QUESTIONS,
  type FixtureQuestion,
} from "./data";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter: adapter as any });

/** Closes this module's own db connections -- callers that import runSeed() directly (rather than running this file as a subprocess) are responsible for calling this once done, or the pg Pool keeps the process alive. */
export async function closeSeedConnections() {
  await prisma.$disconnect();
  await pool.end();
}

async function upsertUser(fixture: { mobileNumber: string; password: string; firstName: string; lastName: string }, role: "TEACHER" | "STUDENT") {
  const hashed = await hash(fixture.password, 12);
  return prisma.user.upsert({
    where: { mobileNumber: fixture.mobileNumber },
    update: { password: hashed, role, accountStatus: "APPROVED", firstName: fixture.firstName, lastName: fixture.lastName },
    create: {
      mobileNumber: fixture.mobileNumber,
      password: hashed,
      role,
      accountStatus: "APPROVED",
      firstName: fixture.firstName,
      lastName: fixture.lastName,
      ...(role === "STUDENT" ? { subscription: "PREMIUM" as const, aiTokens: 100 } : {}),
    },
  });
}

async function upsertQuestions(questions: FixtureQuestion[], createdById: string) {
  for (const q of questions) {
    await prisma.question.upsert({
      where: { id: q.id },
      update: {
        content: q.content,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        difficulty: q.difficulty,
        topic: q.topic,
        status: "APPROVED",
        scope: "PUBLIC",
        type: "SINGLE_CHOICE",
      },
      create: {
        id: q.id,
        content: q.content,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        difficulty: q.difficulty,
        topic: q.topic,
        subject: "Mathematics",
        class: "Class 12",
        status: "APPROVED",
        scope: "PUBLIC",
        type: "SINGLE_CHOICE",
        createdById,
      },
    });
  }
}

export async function runSeed() {
  const teacher = await upsertUser(E2E_TEACHER, "TEACHER");
  const student = await upsertUser(E2E_STUDENT, "STUDENT");

  const batch = await prisma.batch.upsert({
    where: { code: E2E_BATCH_CODE },
    update: { name: E2E_BATCH_NAME, teacherId: teacher.id },
    create: { code: E2E_BATCH_CODE, name: E2E_BATCH_NAME, class: "Class 12", teacherId: teacher.id },
  });

  await prisma.batchEnrollment.upsert({
    where: { batchId_studentId: { batchId: batch.id, studentId: student.id } },
    update: { status: "APPROVED" },
    create: { batchId: batch.id, studentId: student.id, status: "APPROVED" },
  });

  // Fresh-start the stateful/accumulating pieces a spec run creates, so
  // repeated local runs behave the same way every time.
  await prisma.intervention.deleteMany({ where: { teacherId: teacher.id } });
  await prisma.test.deleteMany({ where: { createdById: teacher.id } }); // cascades sections/questions/assignments/attempts
  await prisma.learningPathProgress.deleteMany({ where: { userId: student.id, topic: LEARNING_PATH_TOPIC } });
  await prisma.bookmarkList.deleteMany({ where: { userId: student.id } }); // cascades items
  await prisma.studentFlashcard.deleteMany({ where: { userId: student.id } });
  await prisma.mistakeNotebookEntry.deleteMany({ where: { userId: student.id } });
  // Real practice submissions during the suite (learning-path, mistakes)
  // write their own StudentProgress rows for their own topics -- clear
  // those at the start of a run so stray topics don't accumulate across
  // many local re-runs. They'll legitimately reappear once those specs
  // run again later in the same pass.
  await prisma.studentProgress.deleteMany({ where: { userId: student.id, topic: { in: [LEARNING_PATH_TOPIC, MISTAKES_TOPIC] } } });

  await upsertQuestions(LEARNING_PATH_QUESTIONS, teacher.id);
  await upsertQuestions(WEAK_TOPIC_QUESTIONS, teacher.id);
  await upsertQuestions(HEATMAP_QUESTIONS, teacher.id);
  await upsertQuestions(BUILDER_QUESTIONS, teacher.id);
  await upsertQuestions(MISTAKES_QUESTIONS, teacher.id);

  // Below-threshold mastery on WEAK_TOPIC so the teacher's "suggested
  // support" list and the heatmap's at-risk list both surface this student.
  await prisma.studentProgress.upsert({
    where: { userId_topic: { userId: student.id, topic: WEAK_TOPIC } },
    update: { masteryScore: 20 },
    create: { userId: student.id, topic: WEAK_TOPIC, masteryScore: 20 },
  });
  await prisma.studentProgress.upsert({
    where: { userId_topic: { userId: student.id, topic: HEATMAP_TOPIC } },
    update: { masteryScore: 60 },
    create: { userId: student.id, topic: HEATMAP_TOPIC, masteryScore: 60 },
  });

  // Real response history for the class heatmap's wrong-answer breakdown --
  // a practice-arena-style attempt (testId: null) is enough; the heatmap
  // routes only care about TestResponse.attemptId -> TestAttempt.userId.
  const attempt = await prisma.testAttempt.upsert({
    where: { id: "e2e-hm-attempt-1" },
    update: { status: "SUBMITTED", endTime: new Date() },
    create: { id: "e2e-hm-attempt-1", userId: student.id, isPracticeArena: true, status: "SUBMITTED", endTime: new Date() },
  });

  const wrongLetterFor = (correct: FixtureQuestion["correctAnswer"]) => (["A", "B", "C", "D"] as const).find((l) => l !== correct)!;
  for (const [i, q] of HEATMAP_QUESTIONS.entries()) {
    const isCorrect = i >= HEATMAP_QUESTIONS.length - 2; // last two answered correctly, rest wrong
    const selectedOption = isCorrect ? q.correctAnswer : wrongLetterFor(q.correctAnswer);
    await prisma.testResponse.upsert({
      where: { id: `e2e-hm-resp-${i + 1}` },
      update: { selectedOption, isCorrect },
      create: { id: `e2e-hm-resp-${i + 1}`, attemptId: attempt.id, questionId: q.id, selectedOption, isCorrect, status: "ANSWERED" },
    });
  }

  console.log("e2e fixtures ready:", {
    teacherId: teacher.id,
    studentId: student.id,
    batchId: batch.id,
    questions: LEARNING_PATH_QUESTIONS.length + WEAK_TOPIC_QUESTIONS.length + HEATMAP_QUESTIONS.length + BUILDER_QUESTIONS.length,
  });
}

/**
 * Only a subprocess (`npx tsx seed.ts`) needs this entry point --
 * e2e/global-setup.ts imports and calls runSeed() directly in-process
 * instead, specifically because spawning a child process for this from
 * Playwright's globalSetup has failed in at least one real environment
 * (a Windows libuv bug, `uv_os_get_passwd returned ENOMEM`, unrelated to
 * actual available memory) that in-process execution sidesteps entirely.
 */
if (require.main === module) {
  runSeed()
    .catch((e) => {
      console.error("e2e fixture seeding failed:", e);
      process.exitCode = 1;
    })
    .finally(closeSeedConnections);
}
