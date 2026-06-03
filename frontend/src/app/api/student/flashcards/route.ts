import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { searchParams } = new URL(req.url);
        const folderId = searchParams.get("folderId");
        
        let whereClause = {};
        if (folderId) {
            whereClause = { folderId };
        }

        // Fetch up to 20 random flashcards
        const flashcards = await prisma.flashcard.findMany({
            where: whereClause,
            take: 20,
            orderBy: { createdAt: 'desc' }
        });

        // Simple Fisher-Yates shuffle to randomize locally before returning
        for (let i = flashcards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [flashcards[i], flashcards[j]] = [flashcards[j], flashcards[i]];
        }

        return NextResponse.json({ success: true, flashcards });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
