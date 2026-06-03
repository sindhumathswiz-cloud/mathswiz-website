import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { url, type } = await req.json();
        if (!url) return NextResponse.json({ error: "No URL provided" }, { status: 400 });

        if (type === 'web') {
            // The r.jina.ai wrapper converts any URL into LLM-friendly Markdown, 
            // preserving tables, code blocks, and most importantly, math markup!
            const response = await fetch(`https://r.jina.ai/${url}`);
            const text = await response.text();

            if (!response.ok) throw new Error("Failed to fetch web content.");
            return NextResponse.json({ text });
        }

        if (type === 'youtube') {
            // Placeholder for YouTube transcript extraction logic (e.g., using youtube-transcript package)
            return NextResponse.json({ text: "YouTube extraction pending implementation." });
        }

        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

