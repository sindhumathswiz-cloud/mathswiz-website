import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getTopicCoverage, getUnderCoveredTopics } from "@/lib/topic-coverage";
import { generateQuestions } from "@/lib/question-generator";
import { downloadNcertPdf } from "@/lib/syllabus-scraper";
import { computeContentHash } from "@/lib/question-classifier";
import { cleanMathpixMarkdown } from "@/lib/mathpix-parser";
import { chunkMarkdown } from "@/lib/markdown-chunker";
import { structureQuestions } from "@/lib/structure-questions";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const boards: string[] = body.boards || ["CBSE"];
    const classes: string[] = body.classes || ["Class 10", "Class 11", "Class 12"];
    const targetPerTopic = body.targetPerTopic || 5;
    const shouldScrape = body.scrape !== false;
    const shouldGenerate = body.generate !== false;

    const results: {
      board: string;
      className: string;
      topicName: string;
      scraped: number;
      generated: number;
      errors: string[];
    }[] = [];

    const createdById = (session.user as any).id || "admin";

    for (const board of boards) {
      const report = await getTopicCoverage(board, targetPerTopic);
      const underCovered = getUnderCoveredTopics(report, 1);

      for (const topic of underCovered) {
        if (!classes.includes(topic.className)) continue;

        const entry = {
          board,
          className: topic.className,
          topicName: topic.topicName,
          scraped: 0,
          generated: 0,
          errors: [] as string[],
        };

        // Find the TOPIC-level TagTaxonomy entry
        const topicTag = await prisma.tagTaxonomy.findFirst({
          where: {
            type: "TOPIC",
            name: topic.topicName,
            parent: { type: "SUBJECT", name: "Mathematics", parent: { type: "CLASS", name: topic.className } },
          },
        });
        if (!topicTag) {
          entry.errors.push(`No TagTaxonomy found for ${topic.className} / ${topic.topicName}`);
          results.push(entry);
          continue;
        }

        const subtopicTags = await prisma.tagTaxonomy.findMany({
          where: { type: "SUBTOPIC", parentId: topicTag.id },
          select: { id: true, name: true },
        });

        const needed = Math.max(1, topic.deficit);

        // --- Scrape path: download NCERT PDF, process via Mathpix + LLM ---
        if (shouldScrape) {
          try {
            const pdf = await downloadNcertPdf(topic.className, topic.topicName);
            if (pdf.success && pdf.pdfBuffer) {
              const formData = new FormData();
              formData.append("file", new Blob([new Uint8Array(pdf.pdfBuffer)]), `${topic.topicName.replace(/\s+/g, "_")}.pdf`);
              formData.append("taxonomyIds", JSON.stringify([topicTag.id]));

              const extractRes = await fetch(
                `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/admin/extract-pdf`,
                { method: "POST", body: formData },
              );
              const extractData = await extractRes.json();
              if (extractData.success) {
                entry.scraped = extractData.savedCount || 0;
              } else {
                entry.errors.push(`Extraction failed: ${extractData.error}`);
              }
            } else {
              entry.errors.push(pdf.error || "PDF download failed");
            }
          } catch (e: any) {
            entry.errors.push(`Scrape error: ${e.message}`);
          }
        }

        // --- Generate path: AI question generation ---
        if (shouldGenerate && needed > 0) {
          try {
            const questions = await generateQuestions({
              board,
              className: topic.className,
              subject: "Mathematics",
              topicName: topic.topicName,
              subtopics: topic.subtopics,
              count: needed,
            });

            for (const q of questions) {
              const hash = computeContentHash(q.questionContent);

              // Check if an APPROVED question with this hash already exists
              const existing = await prisma.question.findFirst({
                where: { status: "APPROVED", contentHash: hash },
                select: { id: true },
              });
              if (existing) continue;

              const created = await prisma.question.create({
                data: {
                  content: q.questionContent,
                  contentHash: hash,
                  options: q.options,
                  correctAnswer: q.correctAnswer,
                  explanation: q.explanation,
                  type: q.type as any,
                  difficulty: q.difficulty as any,
                  subject: "Mathematics",
                  class: topic.className,
                  examType: board === "JEE_MAIN" ? "JEE" : board !== "CBSE" ? board : "Board",
                  tags: [...new Set([...(q.tags || []), "AUTO-GENERATED", board, topic.className, topic.topicName])],
                  status: "DRAFT",
                  scope: "PUBLIC",
                  createdById,
                },
              });

              // Tag with topic
              await prisma.questionTag.create({
                data: { questionId: created.id, tagId: topicTag.id },
              });
              // Tag with subtopics
              for (const st of subtopicTags) {
                await prisma.questionTag.create({
                  data: { questionId: created.id, tagId: st.id },
                });
              }

              entry.generated++;
            }
          } catch (e: any) {
            entry.errors.push(`Generation error: ${e.message}`);
          }
        }

        results.push(entry);
      }
    }

    const totalCreated = results.reduce((s, r) => s + r.scraped + r.generated, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

    return NextResponse.json({
      success: true,
      totalCreated,
      totalErrors,
      details: results,
    });
  } catch (error: any) {
    console.error("[AUTO-POPULATE] Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
