import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import mammoth from "mammoth";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "TEACHER") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const formData = await req.formData();
        const files = formData.getAll('files') as File[];
        const folderId = formData.get('folderId') as string;

        if (!files.length || !folderId) return NextResponse.json({ error: "Missing files or folderId" }, { status: 400 });

        const results = [];

        for (const file of files) {
            let extractedText = "";
            let sourceType = "TEXT";

            const buffer = Buffer.from(await file.arrayBuffer());

            if (file.name.endsWith('.docx')) {
                sourceType = "WORD";
                const result = await mammoth.extractRawText({ buffer });
                extractedText = result.value;
            } else if (file.name.endsWith('.pdf') || file.type.startsWith('image/')) {
                sourceType = file.name.endsWith('.pdf') ? "PDF" : "IMAGE";
                // --- CALL MATHPIX ---
                if (process.env.MATHPIX_APP_ID && process.env.MATHPIX_APP_KEY) {
                    const base64 = buffer.toString('base64');
                    const mathpixRes = await fetch("https://api.mathpix.com/v3/text", {
                        method: "POST",
                        headers: {
                            "app_id": process.env.MATHPIX_APP_ID,
                            "app_key": process.env.MATHPIX_APP_KEY,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({ src: `data:${file.type};base64,${base64}`, formats: ["text"] })
                    });
                    const mathpixData = await mathpixRes.json();
                    extractedText = mathpixData.text || "";
                } else {
                    extractedText = "Mathpix credentials missing. Content not extracted.";
                }
            }

            if (extractedText.trim()) {
                const doc = await prisma.knowledgeDocument.create({
                    data: {
                        folderId,
                        title: file.name,
                        sourceType,
                        content: extractedText
                    }
                });
                results.push(doc);
            }
        }

        return NextResponse.json({ success: true, count: results.length });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

