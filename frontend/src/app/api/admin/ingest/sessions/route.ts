import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const formData = await request.formData().catch(() => null);
    if (!formData) return NextResponse.json({ success: false, error: "Invalid form data" }, { status: 400 });

    const file = formData.get('file') as File;
    const topicId = formData.get('topicId') as string;
    const topicIdsRaw = formData.get('topicIds') as string;
    if (!file) return NextResponse.json({ success: false, error: "file is required" }, { status: 400 });

    // Resolve topic IDs — prefer topicIds array, fallback to single topicId
    let topicIds: string[] = [];
    if (topicIdsRaw) {
      try { topicIds = JSON.parse(topicIdsRaw); } catch { topicIds = topicId ? [topicId] : []; }
    } else if (topicId) {
      topicIds = [topicId];
    }

    // Resolve all taxonomy IDs to extract class, subject, and topic names
    let className = 'Class 12', subjectName = 'Mathematics';
    const resolvedTopics: { id: string; name: string; type: string }[] = [];

    for (const tid of topicIds) {
      const taxNode = await prisma.tagTaxonomy.findUnique({
        where: { id: tid },
        include: { parent: { include: { parent: { include: { parent: true } } } } }
      });
      if (taxNode) {
        resolvedTopics.push({ id: taxNode.id, name: taxNode.name, type: taxNode.type });

        // Traverse hierarchy to find class and subject
        let current: any = taxNode;
        let foundClass = false, foundSubject = false;

        // Walk up the tree to find CLASS and SUBJECT
        while (current) {
          if (current.type === 'CLASS' && !foundClass) {
            className = current.name;
            foundClass = true;
          }
          if (current.type === 'SUBJECT' && !foundSubject) {
            subjectName = current.name;
            foundSubject = true;
          }
          if (foundClass && foundSubject) break;
          current = current.parent;
        }
      }
    }

    const topicName = resolvedTopics.length > 0 ? resolvedTopics.map(t => t.name).join(', ') : null;

    if (!process.env.MATHPIX_APP_ID || !process.env.MATHPIX_APP_KEY) {
      return NextResponse.json({ success: false, error: "Mathpix credentials not configured" }, { status: 500 });
    }

    // Save uploaded file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
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

    // Get markdown — try per-page first, fallback to full document
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

    console.log(`[INGEST] Mathpix returned ${pageMarkdowns.length} pages, ${pageMarkdowns.reduce((a, b) => a + b.length, 0)} total chars`);
    console.log(`[INGEST] Topic IDs: ${topicIds.length}, Topics: ${topicName}`);

    // Create SourceDocument + DocumentPages + ExtractionSession
    const doc = await prisma.sourceDocument.create({
      data: {
        title: file.name,
        sourceType: 'PDF',
        filePath: `/uploads/${safeName}`,
        className,
        subject: subjectName,
        status: 'COMPLETED',
        totalPages: pageMarkdowns.length,
        ingestedBy: userId,
      }
    });

    for (let i = 0; i < pageMarkdowns.length; i++) {
      await prisma.documentPage.create({
        data: {
          documentId: doc.id,
          pageNumber: i + 1,
          rawMarkdown: pageMarkdowns[i],
          rawText: pageMarkdowns[i].replace(/\$\$/g, '').replace(/\$/g, ''),
          status: 'COMPLETED',
        }
      });
    }

    const extractionSession = await prisma.extractionSession.create({
      data: {
        userId,
        sourceDocumentId: doc.id,
        status: 'DRAFT',
        authoredQuestions: [],
        topicIds: topicIds.length > 0 ? topicIds : Prisma.JsonNull,
        topicId: topicIds[0] || null,
        topicName,
        subjectName,
        className,
      }
    });

    return NextResponse.json({
      success: true,
      sessionId: extractionSession.id,
      sourceDocumentId: doc.id,
      sourceFile: file.name,
      sourceUrl: `/uploads/${safeName}`,
      totalPages: pageMarkdowns.length,
      topicCount: topicIds.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[SESSIONS-POST] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where: any = { userId };
    if (status) where.status = status;

    const sessions = await prisma.extractionSession.findMany({
      where,
      include: {
        sourceDocument: {
          select: { title: true, filePath: true, totalPages: true }
        },
        solutionDocument: {
          select: { id: true, title: true, totalPages: true }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ success: true, sessions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch sessions";
    console.error("[SESSIONS-GET] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
