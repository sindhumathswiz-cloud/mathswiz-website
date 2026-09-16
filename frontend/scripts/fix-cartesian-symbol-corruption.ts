import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

config({ path: '.env.local', quiet: true });

/**
 * Minimal reimplementation of extract-book-page.ts's ocrPageWithMathpix --
 * that module transitively imports question-qa.ts -> MathRenderer.tsx ->
 * katex's CSS (a webpack-only side-effect import), which breaks a plain
 * tsx/node script. This calls the identical Mathpix v3/text endpoint the
 * same way (same options, same cleanup), just without that import chain.
 */
async function ocrPageWithMathpixStandalone(imagePath: string, assertPrivatePageImagePath: (p: string) => string, cleanMathpixMarkdown: (t: string) => string) {
  const safePath = assertPrivatePageImagePath(imagePath);
  if (!process.env.MATHPIX_APP_ID || !process.env.MATHPIX_APP_KEY) {
    throw new Error('Mathpix credentials are not configured (MATHPIX_APP_ID / MATHPIX_APP_KEY)');
  }
  const bytes = await readFile(safePath);
  const ext = path.extname(safePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: mime }), path.basename(safePath));
  form.set('options_json', JSON.stringify({
    formats: ['text'],
    rm_spaces: false,
    math_inline_delimiters: ['\\(', '\\)'],
    math_display_delimiters: ['\\[', '\\]'],
  }));
  const response = await fetch('https://api.mathpix.com/v3/text', {
    method: 'POST',
    headers: { app_id: process.env.MATHPIX_APP_ID, app_key: process.env.MATHPIX_APP_KEY },
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  const output = await response.json();
  if (!response.ok || output.error) throw new Error(output.error || `Mathpix returned ${response.status}`);
  const text = typeof output.text === 'string' ? output.text : '';
  return { text: cleanMathpixMarkdown(text), confidence: typeof output.confidence === 'number' ? output.confidence : null };
}

/**
 * One-time repair for the RS Aggarwal "#" -> "x" (Cartesian-product times
 * symbol) corruption diagnosed earlier this session: 24 DRAFT questions from
 * book cmtztovgh036a28nywv0q0cta (pages 62-72) have a literal "\#" standing
 * in for "\times" because the source PDF's symbol font broke for that glyph
 * on the fallback (groq) extraction path.
 *
 * Rather than blindly substituting the known-correct mapping, this re-OCRs
 * each affected source page through the same Mathpix v3/text call the
 * manual snip tool (PageSnipTool.tsx -> ocrPageWithMathpix()) uses -- i.e.
 * it re-derives the replacement from the actual page image, and only
 * applies a question's fix once that page's fresh OCR text corroborates
 * "\times" is really what's there. Any question whose page doesn't
 * corroborate is left untouched and reported for manual follow-up instead
 * of being force-fixed. (Reimplemented standalone below rather than
 * importing ocrPageWithMathpix directly -- extract-book-page.ts
 * transitively pulls in a React component with a CSS side-effect import
 * that a plain script can't load; see ocrPageWithMathpixStandalone.)
 *
 * Every changed row gets a QuestionVersion snapshot first (matching
 * strip-leading-numbers/route.ts's precedent), so this is reviewable and
 * reversible, not a blind in-place rewrite -- per CLAUDE.md's "preserve
 * question history/versioning" rule.
 */

const BOOK_ID = 'cmtztovgh036a28nywv0q0cta';
// Sumod -- the admin who authored/owns these questions and who this session
// is acting on behalf of (confirmed via User lookup), so the QuestionVersion
// / AuditLog trail attributes to a real account rather than a synthetic one.
const ACTOR_USER_ID = 'cmo1e6oj000028wnyzm8komsp';

async function main() {
  const { default: prisma } = await import('../src/lib/prisma');
  const { assertPrivatePageImagePath } = await import('../src/lib/book-storage');
  const { cleanMathpixMarkdown } = await import('../src/lib/mathpix-parser');

  const questions = await prisma.question.findMany({
    where: {
      bookId: BOOK_ID,
      status: 'DRAFT',
      OR: [{ content: { contains: '\\#' } }, { explanation: { contains: '\\#' } }],
    },
    select: {
      id: true, content: true, options: true, correctAnswer: true, explanation: true,
      type: true, difficulty: true, topic: true, subTopic: true, tags: true,
      currentVersion: true, sourcePageStart: true, sourcePageEnd: true,
    },
  });
  console.log(`fix_scan found=${questions.length}`);

  const run = await prisma.book.findUnique({
    where: { id: BOOK_ID },
    select: { ingestionRuns: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, sourceDocumentId: true } } },
  }).then((b) => b?.ingestionRuns[0]);
  if (!run?.sourceDocumentId) throw new Error('No ingestion run / sourceDocumentId for book');

  // Cache OCR text per page number so pages shared by multiple questions
  // (e.g. the 63-64 range) are only re-OCR'd once.
  const pageOcrCache = new Map<string, string>();
  async function ocrPage(pageNumber: number): Promise<string> {
    const key = String(pageNumber);
    if (pageOcrCache.has(key)) return pageOcrCache.get(key)!;
    const page = await prisma.documentPage.findFirst({
      where: { documentId: run!.sourceDocumentId!, pageNumber },
      select: { processedImagePath: true, pageImagePath: true },
    });
    const imagePath = page?.processedImagePath || page?.pageImagePath;
    if (!imagePath) {
      console.log(`fix_page_missing page=${pageNumber}`);
      pageOcrCache.set(key, '');
      return '';
    }
    const ocr = await ocrPageWithMathpixStandalone(imagePath, assertPrivatePageImagePath, cleanMathpixMarkdown);
    console.log(`fix_page_ocr page=${pageNumber} chars=${ocr.text.length} confidence=${ocr.confidence ?? 'n/a'}`);
    pageOcrCache.set(key, ocr.text);
    return ocr.text;
  }

  mkdirSync('qa-backups', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `qa-backups/cartesian-symbol-fix-${stamp}.json`;
  writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), questions }, null, 2));
  console.log(`fix_backup path=${backupPath} questions=${questions.length}`);

  let fixed = 0;
  let skipped = 0;
  const fixedIds: string[] = [];
  const skippedIds: { id: string; reason: string }[] = [];

  for (const q of questions) {
    const start = q.sourcePageStart ?? undefined;
    if (!start) {
      skipped += 1;
      skippedIds.push({ id: q.id, reason: 'no_source_page' });
      console.log(`fix_skip id=${q.id} reason=no_source_page`);
      continue;
    }
    const end = q.sourcePageEnd ?? start;

    let pageText = '';
    for (let p = start; p <= end; p++) {
      pageText += (await ocrPage(p)) + '\n';
    }

    if (!pageText.includes('\\times')) {
      skipped += 1;
      skippedIds.push({ id: q.id, reason: 'ocr_did_not_corroborate_times' });
      console.log(`fix_skip id=${q.id} reason=ocr_did_not_corroborate_times pages=${start}-${end}`);
      continue;
    }

    const repairedContent = q.content.replace(/\\#/g, '\\times ');
    const repairedExplanation = q.explanation ? q.explanation.replace(/\\#/g, '\\times ') : q.explanation;
    if (repairedContent === q.content && repairedExplanation === q.explanation) {
      skipped += 1;
      skippedIds.push({ id: q.id, reason: 'no_change' });
      continue;
    }
    if (repairedContent.includes('\\#') || (repairedExplanation ?? '').includes('\\#')) {
      skipped += 1;
      skippedIds.push({ id: q.id, reason: 'residual_hash_after_replace' });
      console.log(`fix_skip id=${q.id} reason=residual_hash_after_replace`);
      continue;
    }

    try {
      await prisma.$transaction([
        prisma.questionVersion.create({
          data: {
            questionId: q.id,
            version: q.currentVersion,
            content: q.content,
            options: q.options ?? undefined,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            type: q.type,
            difficulty: q.difficulty,
            topic: q.topic,
            subTopic: q.subTopic,
            tags: q.tags,
            changedBy: ACTOR_USER_ID,
            changeReason: `Repaired PDF symbol-font corruption: literal "\\#" -> "\\times", corroborated by re-OCRing source page(s) ${start}-${end} via Mathpix (same pipeline as the manual snip tool)`,
          },
        }),
        prisma.question.update({
          where: { id: q.id },
          data: {
            content: repairedContent,
            explanation: repairedExplanation,
            currentVersion: { increment: 1 },
          },
        }),
      ]);
      fixed += 1;
      fixedIds.push(q.id);
      console.log(`fix_progress id=${q.id} fixed=${fixed}`);
    } catch (error) {
      skipped += 1;
      skippedIds.push({ id: q.id, reason: error instanceof Error ? error.message : String(error) });
      console.log(`fix_error id=${q.id} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await prisma.auditLog.create({
    data: {
      actorId: ACTOR_USER_ID,
      actorRole: 'ADMIN',
      action: 'QUESTION_SYMBOL_CORRUPTION_FIXED_BULK',
      entityType: 'Question',
      entityId: BOOK_ID,
      metadata: { bookId: BOOK_ID, fixed, skipped, fixedIds, skippedIds, backupPath },
    },
  });

  console.log(`fix_complete fixed=${fixed} skipped=${skipped} backup=${backupPath}`);
  if (skippedIds.length) {
    console.log('fix_skipped_detail', JSON.stringify(skippedIds, null, 2));
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
