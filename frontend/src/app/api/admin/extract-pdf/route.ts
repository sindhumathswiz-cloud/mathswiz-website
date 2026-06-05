import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { cleanMathpixMarkdown } from "@/lib/mathpix-parser";
import { chunkMarkdown } from "@/lib/markdown-chunker";
import { structureQuestions } from "@/lib/structure-questions";
import { dedupeByContent } from "@/lib/page-windows";
import { computeContentHash } from "@/lib/question-classifier";
import type { CanonicalQuestion } from "@/lib/extract-normalizer";

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File;
        const folderId = formData.get('folderId') as string;
        const taxonomyIdsRaw = formData.get('taxonomyIds') as string;
        const taxonomyIds: string[] = taxonomyIdsRaw ? JSON.parse(taxonomyIdsRaw) : [];

        if (!file || (!folderId && taxonomyIds.length === 0)) {
            return NextResponse.json({ success: false, error: "Missing file or topic selection" }, { status: 400 });
        }
        if (!process.env.MATHPIX_APP_ID || !process.env.MATHPIX_APP_KEY) {
            return NextResponse.json({ error: "Mathpix credentials missing." }, { status: 500 });
        }
        if (!process.env.GROQ_API_KEY) {
            return NextResponse.json({ error: "GROQ_API_KEY is not set." }, { status: 500 });
        }

        // ── 1. Mathpix async PDF: send whole document, poll, fetch markdown ──
        console.log(`[EXTRACT-PDF] Sending ${file.name} to Mathpix Async API...`);
        const mathpixFormData = new FormData();
        mathpixFormData.append("file", file);
        mathpixFormData.append("options_json", JSON.stringify({
            math_inline_delimiters: ["$", "$"],
            math_display_delimiters: ["$$", "$$"],
            rm_spaces: true
        }));

        const mathpixRes = await fetch("https://api.mathpix.com/v3/pdf", {
            method: "POST",
            headers: { "app_id": process.env.MATHPIX_APP_ID, "app_key": process.env.MATHPIX_APP_KEY },
            body: mathpixFormData as any
        });
        const mathpixData = await mathpixRes.json();
        if (mathpixData.error) throw new Error(mathpixData.error);
        if (!mathpixData.pdf_id) throw new Error("No pdf_id returned from Mathpix");
        const pdfId = mathpixData.pdf_id;

        let isCompleted = false;
        let pollCount = 0;
        while (!isCompleted && pollCount < 60) {
            await new Promise(r => setTimeout(r, 3000));
            const statusRes = await fetch(`https://api.mathpix.com/v3/pdf/${pdfId}`, {
                headers: { "app_id": process.env.MATHPIX_APP_ID!, "app_key": process.env.MATHPIX_APP_KEY! }
            });
            const statusData = await statusRes.json();
            if (statusData.status === 'completed') isCompleted = true;
            else if (statusData.status === 'error') throw new Error("Mathpix PDF processing failed");
            pollCount++;
        }
        if (!isCompleted) throw new Error("Mathpix processing timed out");

        const mdRes = await fetch(`https://api.mathpix.com/v3/pdf/${pdfId}.md`, {
            headers: { "app_id": process.env.MATHPIX_APP_ID!, "app_key": process.env.MATHPIX_APP_KEY! }
        });
        const rawText = await mdRes.text();
        const cleanedText = cleanMathpixMarkdown(rawText);
        console.log(`[EXTRACT-PDF] Got ${cleanedText.length} chars of markdown.`);

        // ── 2. Structure via Groq in overlapping chunks (replaces the brittle
        //       regex parser); dedupe the chunk overlap ──
        const chunks = chunkMarkdown(cleanedText, 6000, 1);
        console.log(`[EXTRACT-PDF] Structuring ${chunks.length} chunks via LLM (Gemini 3.5-flash, Groq fallback)...`);

        // Process chunks concurrently (Gemini's free tier has ample TPM headroom)
        // via a fixed-size worker pool. ~4x faster than sequential on big chapters.
        // Order is preserved by writing into results[i]; progress is logged.
        const CONCURRENCY = 4;
        const results: CanonicalQuestion[][] = new Array(chunks.length);
        let completed = 0;
        const worker = async (start: number) => {
            for (let i = start; i < chunks.length; i += CONCURRENCY) {
                try {
                    results[i] = await structureQuestions(chunks[i]);
                } catch (e: any) {
                    results[i] = [];
                    console.error(`[EXTRACT-PDF] Chunk ${i + 1}/${chunks.length} failed: ${e.message}`);
                }
                console.log(`[EXTRACT-PDF] chunk ${++completed}/${chunks.length} done`);
            }
        };
        await Promise.all(
            Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, (_, k) => worker(k))
        );
        let extracted: CanonicalQuestion[] = dedupeByContent(results.flat());
        console.log(`[EXTRACT-PDF] ${extracted.length} questions after in-batch dedupe.`);

        // ── 3. Resolve class/subject/board + topic names from the selected taxonomy ──
        let resolvedClassName = "Class 12";
        let resolvedSubjectName = "Mathematics";
        let board: string | null = null;
        const topicNames: string[] = [];
        if (taxonomyIds.length > 0) {
            const selected = await prisma.tagTaxonomy.findMany({
                where: { id: { in: taxonomyIds } },
                include: { parent: { include: { parent: { include: { parent: true } } } } }
            });
            for (const t of selected) {
                if (t.type === 'TOPIC') topicNames.push(t.name);
                let node: any = t;
                while (node) {
                    if (node.type === 'CLASS') resolvedClassName = node.name;
                    if (node.type === 'SUBJECT') resolvedSubjectName = node.name;
                    if (node.boardType) board = node.boardType;
                    node = node.parent;
                }
            }
        }
        const examType = board === 'JEE_MAIN' ? 'JEE' : (board && board !== 'CBSE') ? board : 'Board';

        // ── 3b. Clear this chapter's existing DRAFTs so re-extraction is a clean
        // slate (never touches APPROVED). Matches drafts tagged with the selected
        // taxonomy OR carrying the topic name as a free-text field (old pipeline). ──
        let clearedDrafts = 0;
        if (taxonomyIds.length > 0) {
            const tagged = (await prisma.questionTag.findMany({
                where: { tagId: { in: taxonomyIds } },
                select: { questionId: true },
            })).map(t => t.questionId);
            const staleIds = (await prisma.question.findMany({
                where: {
                    status: 'DRAFT',
                    OR: [
                        ...(tagged.length ? [{ id: { in: tagged } }] : []),
                        ...(topicNames.length ? [{ topic: { in: topicNames, mode: 'insensitive' as const } }] : []),
                    ],
                },
                select: { id: true },
            })).map(d => d.id);
            // Never delete a draft referenced by a test/response (FK is RESTRICT).
            const blocked = new Set([
                ...(await prisma.testQuestion.findMany({ where: { questionId: { in: staleIds } }, select: { questionId: true } })).map(t => t.questionId),
                ...(await prisma.testResponse.findMany({ where: { questionId: { in: staleIds } }, select: { questionId: true } })).map(t => t.questionId),
            ]);
            const deletable = staleIds.filter(id => !blocked.has(id));
            if (deletable.length) {
                clearedDrafts = (await prisma.question.deleteMany({ where: { id: { in: deletable } } })).count;
            }
        }
        console.log(`[EXTRACT-PDF] Cleared ${clearedDrafts} existing drafts for this chapter.`);

        // ── 3c. Cross-run dedupe against APPROVED only — never re-add an
        // already-published question, but DON'T block on drafts (just cleared). ──
        const hashed = extracted.map(q => ({ q, hash: computeContentHash(q.questionContent) }));
        const approved = await prisma.question.findMany({
            where: { status: 'APPROVED', contentHash: { in: hashed.map(h => h.hash) } },
            select: { contentHash: true },
        });
        const approvedHashes = new Set(approved.map(e => e.contentHash));
        const seenInRun = new Set<string>();
        const toSave = hashed.filter(({ hash }) => {
            if (approvedHashes.has(hash) || seenInRun.has(hash)) return false;
            seenInRun.add(hash);
            return true;
        });
        const skipped = extracted.length - toSave.length;
        console.log(`[EXTRACT-PDF] ${toSave.length} new, ${skipped} already-approved/in-run duplicates skipped.`);

        // ── 4. Save as DRAFT + tag with the selected chapter ──
        const userRole = (session.user as any).role;
        const createdById = (session.user as any).id || 'admin';
        let savedCount = 0;

        for (const { q, hash } of toSave) {
            const created = await prisma.question.create({
                data: {
                    content: q.questionContent,
                    contentHash: hash,
                    options: q.options,
                    correctAnswer: q.correctAnswer,
                    explanation: q.explanation,
                    type: q.type, // already validated by the normalizer against the enum
                    difficulty: q.difficulty, // classified by the LLM, validated by the normalizer
                    subject: resolvedSubjectName,
                    class: resolvedClassName,
                    examType,
                    tags: q.tags ?? [],
                    status: "DRAFT",
                    scope: userRole === 'TEACHER' ? 'TEACHER_PRIVATE' : 'PUBLIC',
                    originalRawText: q.questionContent,
                    createdById,
                    ...(folderId ? { knowledgeFolderId: folderId } : {}),
                }
            });
            for (const tid of taxonomyIds) {
                await prisma.questionTag.create({ data: { questionId: created.id, tagId: tid } });
            }
            savedCount++;
        }

        return NextResponse.json({
            success: true,
            savedCount,
            totalFound: extracted.length,
            duplicatesSkipped: skipped,
            clearedDrafts,
            rawMarkdown: rawText.substring(0, 50000)
        });
    } catch (error: any) {
        console.error(`[EXTRACT-PDF] Fatal Error:`, error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
