import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const { id: sessionId } = await params;

    const existing = await prisma.extractionSession.findUnique({ where: { id: sessionId } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }
    if (existing.userId !== userId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData().catch(() => null);
    if (!formData) return NextResponse.json({ success: false, error: "Invalid form data" }, { status: 400 });

    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ success: false, error: "file is required" }, { status: 400 });

    if (!process.env.MATHPIX_APP_ID || !process.env.MATHPIX_APP_KEY) {
      return NextResponse.json({ success: false, error: "Mathpix credentials not configured" }, { status: 500 });
    }

    // Save uploaded file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const safeName = `solutions_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, safeName), buffer);

    // Upload to Mathpix
    const pdfFormData = new FormData();
    pdfFormData.append('file', new Blob([buffer], { type: 'application/pdf' }), file.name);
    pdfFormData.append('options_json', JSON.stringify({
      conversion_formats: { md: true },
      math_inline_delimiters: ["$", "$"],
      math_display_delimiters: ["$$", "$$"],
    }));

    const uploadRes = await fetch("https://api.mathpix.com/v3/pdf", {
      method: "POST",
      headers: { app_id: process.env.MATHPIX_APP_ID, app_key: process.env.MATHPIX_APP_KEY },
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
        headers: { app_id: process.env.MATHPIX_APP_ID!, app_key: process.env.MATHPIX_APP_KEY! },
      });
      const checkData = await checkRes.json();
      status = checkData.status;
      maxWait -= 5;
      if (status === "error") throw new Error("Mathpix conversion failed");
    }
    if (status !== "completed") throw new Error("Mathpix processing timed out");

    // Get per-page markdown
    const pageMarkdowns: string[] = [];
    const totalPages = uploadData.pages || 1;
    for (let p = 1; p <= totalPages; p++) {
      const pageRes = await fetch(`https://api.mathpix.com/v3/pdf/${pdfId}/${p}.md`, {
        headers: { app_id: process.env.MATHPIX_APP_ID!, app_key: process.env.MATHPIX_APP_KEY! },
      });
      if (pageRes.ok) {
        pageMarkdowns.push(await pageRes.text());
      }
    }

    if (pageMarkdowns.length === 0) {
      const mdRes = await fetch(`https://api.mathpix.com/v3/pdf/${pdfId}.md`, {
        headers: { app_id: process.env.MATHPIX_APP_ID!, app_key: process.env.MATHPIX_APP_KEY! },
      });
      if (!mdRes.ok) throw new Error("Mathpix markdown fetch failed");
      pageMarkdowns.push(await mdRes.text());
    }

    // Create solution SourceDocument
    const solutionDoc = await prisma.sourceDocument.create({
      data: {
        title: file.name,
        sourceType: 'PDF',
        documentCategory: 'SOLUTIONS',
        filePath: `/uploads/${safeName}`,
        className: existing.className,
        subject: existing.subjectName,
        status: 'COMPLETED',
        totalPages: pageMarkdowns.length,
        ingestedBy: userId,
      }
    });

    for (let i = 0; i < pageMarkdowns.length; i++) {
      await prisma.documentPage.create({
        data: {
          documentId: solutionDoc.id,
          pageNumber: i + 1,
          rawMarkdown: pageMarkdowns[i],
          rawText: pageMarkdowns[i].replace(/\$\$/g, '').replace(/\$/g, ''),
          status: 'COMPLETED',
        }
      });
    }

    // Link solution document to session
    await prisma.extractionSession.update({
      where: { id: sessionId },
      data: { solutionDocumentId: solutionDoc.id },
    });

    return NextResponse.json({
      success: true,
      solutionDocumentId: solutionDoc.id,
      totalPages: pageMarkdowns.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[SOLUTIONS-UPLOAD] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
