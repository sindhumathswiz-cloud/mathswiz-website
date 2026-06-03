import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { promises as fs } from 'fs';
import path from 'path';
import { parseMathpixMarkdown } from "@/lib/pdf-extractor";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ success: false, error: "Invalid form data" }, { status: 400 });
    }

    const file = formData.get('file') as File;
    const topicId = formData.get('topicId') as string;

    if (!file) {
      return NextResponse.json({ success: false, error: "file is required" }, { status: 400 });
    }

    // Resolve taxonomy info from topicId
    let className = 'Class 12';
    let subjectName = 'Mathematics';
    let topicName: string | null = null;
    let resolvedTopicId: string | null = topicId || null;

    if (topicId) {
      const topicNode = await prisma.tagTaxonomy.findUnique({
        where: { id: topicId },
        include: {
          parent: {
            include: { parent: true }
          }
        }
      });
      if (topicNode) {
        topicName = topicNode.name;
        if (topicNode.parent) {
          subjectName = topicNode.parent.name;
          if (topicNode.parent.parent) {
            className = topicNode.parent.parent.name;
          }
        }
      }
    }

    if (!process.env.MATHPIX_APP_ID || !process.env.MATHPIX_APP_KEY) {
      return NextResponse.json({ success: false, error: "Mathpix credentials not configured" }, { status: 500 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload PDF to Mathpix
    const blob = new Blob([buffer], { type: 'application/pdf' });
    const pdfFormData = new FormData();
    pdfFormData.append('file', blob, file.name);
    pdfFormData.append('options_json', JSON.stringify({
      conversion_formats: { md: true },
      math_inline_delimiters: ["$", "$"],
      math_display_delimiters: ["$$", "$$"],
    }));

    const uploadRes = await fetch("https://api.mathpix.com/v3/pdf", {
      method: "POST",
      headers: { "app_id": process.env.MATHPIX_APP_ID, "app_key": process.env.MATHPIX_APP_KEY },
      body: pdfFormData,
    });

    const uploadData = await uploadRes.json();
    if (uploadData.error) throw new Error(`Mathpix upload error: ${uploadData.error}`);

    const pdfId = uploadData.pdf_id;
    let status = "in_progress";
    let maxWait = 120;

    while (status !== "completed" && maxWait > 0) {
      await new Promise(r => setTimeout(r, 5000));
      const checkRes = await fetch(`https://api.mathpix.com/v3/pdf/${pdfId}`, {
        headers: { "app_id": process.env.MATHPIX_APP_ID!, "app_key": process.env.MATHPIX_APP_KEY! },
      });
      const checkData = await checkRes.json();
      status = checkData.status;
      maxWait -= 5;
      if (status === "error") throw new Error("Mathpix conversion failed");
    }

    if (status !== "completed") throw new Error("Mathpix processing timed out");

    const mdRes = await fetch(`https://api.mathpix.com/v3/pdf/${pdfId}.md`, {
      headers: { "app_id": process.env.MATHPIX_APP_ID!, "app_key": process.env.MATHPIX_APP_KEY! },
    });
    if (!mdRes.ok) {
      const errText = await mdRes.text();
      throw new Error(`Mathpix markdown fetch failed: ${mdRes.status} - ${errText.slice(0, 200)}`);
    }
    const rawMarkdown = await mdRes.text();

    console.log(`[INGEST] Mathpix returned ${rawMarkdown.length} chars`);

    // Rule-based parsing — no LLM needed
    const problemTexts = parseMathpixMarkdown(rawMarkdown);
    console.log(`[INGEST] Parser extracted ${problemTexts.length} problem blocks`);

    const questions = problemTexts.map((text, i) => ({
      content: text,
      type: 'NUMERICAL',
      options: [],
      correctAnswer: '',
      explanation: '',
      difficulty: 'MEDIUM',
      subject: subjectName,
      class: className,
      topic: topicName || '',
      tagTaxonomyId: resolvedTopicId,
      _tempId: `pdf-${i}`,
    }));

    // Save uploaded file for reference
    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, fileName);
    await fs.writeFile(filePath, buffer);

    return NextResponse.json({
      success: true,
      questions,
      sourceFile: file.name,
      sourceUrl: `/uploads/${fileName}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[INGEST-BOOK] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
