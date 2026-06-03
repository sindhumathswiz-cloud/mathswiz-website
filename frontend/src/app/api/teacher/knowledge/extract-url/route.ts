import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import * as cheerio from "cheerio";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "TEACHER") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { url, type, folderId } = await req.json();
        if (!url || !folderId) return NextResponse.json({ error: "URL and Folder ID required" }, { status: 400 });

        let extractedText = "";
        let title = url;

        if (type === 'YOUTUBE') {
            // YouTube Scraping (Metadata only if transcript library not available)
            const res = await fetch(url);
            const html = await res.text();
            const $ = cheerio.load(html);
            title = $("title").text() || "YouTube Video";
            extractedText = `Video Context: ${title}\nURL: ${url}\n(Note: This video source is registered for the teacher's reference. Full transcript extraction requires an API key.)`;
        } else {
            // Web Scraping
            const res = await fetch(url);
            const html = await res.text();
            const $ = cheerio.load(html);
            
            // Basic cleaning: remove scripts/styles
            $("script, style").remove();
            title = $("title").text() || "Webpage Source";
            extractedText = $("body").text().replace(/\s\s+/g, ' ').trim();
        }

        if (!extractedText.trim()) throw new Error("No content found at URL");

        const doc = await prisma.knowledgeDocument.create({
            data: {
                folderId,
                title,
                sourceType: type,
                content: extractedText
            }
        });

        return NextResponse.json({ success: true, document: doc });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

