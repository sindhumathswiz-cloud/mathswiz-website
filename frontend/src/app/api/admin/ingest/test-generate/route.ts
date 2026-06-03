import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const { folderId } = await req.json();

        if (!folderId) {
            return NextResponse.json({ success: false, error: "Missing folderId" }, { status: 400 });
        }

        // 1. Fetch 3 random chunks from this folder to verify ingestion success
        const chunks = await (prisma as any).documentChunk.findMany({
            where: { folderId },
            take: 3,
            orderBy: { createdAt: 'desc' }, // Simplification: take the newest chunks
        });

        if (chunks.length === 0) {
            return NextResponse.json({ 
                success: false, 
                error: "No ingested content found in this folder. Please run an ingestion job first." 
            });
        }

        // 2. Generate 3 sample questions using Gemini 1.5 Flash
        const prompt = `You are a curriculum validator. Based on the following source material extracted from a textbook, generate 3 high-quality practice questions (with solutions) to prove that the extraction was successful and the context is preserved.
        
        SOURCE MATERIAL:
        ${chunks.map((c: any) => c.content).join("\n\n---\n\n")}
        
        Return STRICT JSON array of objects: 
        { "samples": [ { "question": "...", "answer": "...", "explanation": "..." } ] }`;

        const geminiKey = process.env.GEMINI_API_KEY;
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: "application/json" }
                })
            }
        );

        if (!res.ok) {
            const errText = await res.text();
            return NextResponse.json({ success: false, error: `Gemini Error: ${errText}` }, { status: 500 });
        }

        const data = await res.json();
        const parsed = JSON.parse(data.candidates[0].content.parts[0].text);

        return NextResponse.json({
            success: true,
            samples: parsed.samples || []
        });

    } catch (err: any) {
        console.error("[INGEST-TEST-GENERATE] Error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
