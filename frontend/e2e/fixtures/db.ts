import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { E2E_ADMIN, E2E_READER_TAG } from "./data";
import { applyTestEnvironment, assertIsolatedTestDatabase } from "../test-database";

/**
 * Direct database helpers for specs that need to stand in for work done elsewhere (a page's OCR text layer,
 * a question extracted from it) so the screen under test can be exercised without paid provider calls.
 */
export async function withDb<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  applyTestEnvironment();
  assertIsolatedTestDatabase();
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool as never) as never });
  try { return await fn(prisma); } finally { await prisma.$disconnect(); await pool.end(); }
}

/** Gives a rendered page a text layer: lines at positions given as fractions of the page. */
export async function setPageTextLayer(bookId: string, pageNumber: number, lines: Array<{ y: number; h: number; text: string }>) {
  await withDb(async (prisma) => {
    const run = await prisma.bookIngestionRun.findFirst({ where: { bookId }, orderBy: { createdAt: "desc" }, select: { sourceDocumentId: true } });
    if (!run?.sourceDocumentId) throw new Error("The book has no rendered document yet");
    const textLayer = { version: 1, source: "MATHPIX_OCR", lines: lines.map((line) => ({ x: 0.08, w: 0.84, kind: "text", ...line })) };
    const updated = await prisma.documentPage.updateMany({ where: { documentId: run.sourceDocumentId, pageNumber }, data: { textLayer } });
    if (updated.count !== 1) throw new Error(`Page ${pageNumber} was not found`);
  });
}

/** A question filed under a book page, tagged so the seed removes it before the next run. */
export async function createBookQuestion(bookId: string, input: { content: string; page: number; printedNumber: string; options?: string[]; correctAnswer?: string }) {
  return withDb(async (prisma) => {
    const admin = await prisma.user.findUnique({ where: { mobileNumber: E2E_ADMIN.mobileNumber }, select: { id: true } });
    if (!admin) throw new Error("The e2e admin is missing");
    const question = await prisma.question.create({
      data: {
        content: input.content,
        type: input.options ? "SINGLE_CHOICE" : "SHORT_ANSWER",
        options: input.options ?? undefined,
        correctAnswer: input.correctAnswer ?? "",
        explanation: "",
        status: "DRAFT",
        provenance: "BOOK_SOURCED",
        bookId,
        sourcePageStart: input.page,
        sourcePageEnd: input.page,
        printedNumber: input.printedNumber,
        tags: [E2E_READER_TAG],
        createdById: admin.id,
      },
      select: { id: true },
    });
    return question.id;
  });
}

export async function readQuestion(id: string) {
  return withDb((prisma) => prisma.question.findUnique({ where: { id }, select: { content: true, correctAnswer: true, options: true, currentVersion: true } }));
}

export async function countVersions(questionId: string) {
  return withDb((prisma) => prisma.questionVersion.count({ where: { questionId } }));
}
