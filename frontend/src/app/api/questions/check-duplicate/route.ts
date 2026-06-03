import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const { content } = await req.json();
        if (!content || typeof content !== "string") {
            return NextResponse.json({ error: "content is required" }, { status: 400 });
        }

        // Normalise: strip LaTeX whitespace variations, lowercase
        const normalise = (s: string) =>
            s.replace(/\s+/g, " ").replace(/\\,|\\;|\\!/g, "").trim().toLowerCase();

        const needle = normalise(content);

        // Use first 60 characters as a fast index-friendy pre-filter
        const prefix = content.slice(0, 60);

        const candidates = await prisma.question.findMany({
            where: {
                content: { contains: prefix.slice(0, 30) }
            },
            select: { id: true, content: true },
            take: 20,
        });

        const match = candidates.find(c => {
            const hay = normalise(c.content);
            // Consider "duplicate" if the normalised strings share ≥ 80% of their length
            const shorter = Math.min(needle.length, hay.length);
            const longer = Math.max(needle.length, hay.length);
            if (shorter === 0) return false;
            // Simple prefix-match heuristic is fast and good enough for LaTeX content
            return needle.startsWith(hay.slice(0, Math.floor(shorter * 0.8))) ||
                hay.startsWith(needle.slice(0, Math.floor(shorter * 0.8))) ||
                (needle.length >= 30 && hay.slice(0, 50) === needle.slice(0, 50));
        });

        return NextResponse.json({
            isDuplicate: !!match,
            existingId: match?.id ?? null
        });
    } catch (error: any) {
        console.error("[check-duplicate]", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

