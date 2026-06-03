import { NextResponse } from "next/server";
import { YoutubeTranscript } from 'youtube-transcript';

export async function POST(req: Request) {
    try {
        const body = await req.json();

        // 1. MATHPIX FOR IMAGES & RASTERIZED PDF PAGES
        if (body.type === 'image' && body.fileBase64) {
            if (!process.env.MATHPIX_APP_ID || !process.env.MATHPIX_APP_KEY) {
                throw new Error("Mathpix credentials missing. Please set MATHPIX_APP_ID and MATHPIX_APP_KEY in .env.local");
            }
            
            const mathpixRes = await fetch("https://api.mathpix.com/v3/text", {
                method: "POST",
                headers: {
                    "app_id": process.env.MATHPIX_APP_ID,
                    "app_key": process.env.MATHPIX_APP_KEY,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ 
                    src: body.fileBase64, 
                    formats: ["text", "data"], 
                    data_options: { include_latex: true } 
                })
            });
            const mathpixData = await mathpixRes.json();
            if (mathpixData.error) throw new Error(mathpixData.error);
            return NextResponse.json({ text: mathpixData.text });
        }

        // 2. JINA.AI FOR WEB SCRAPING (Preserves Math Formatting!)
        if (body.type === 'url' && body.url) {
            const response = await fetch(`https://r.jina.ai/${body.url}`);
            if (!response.ok) throw new Error(`Failed to fetch web content: ${response.statusText}`);
            const text = await response.text();
            return NextResponse.json({ text });
        }

        // 3. YOUTUBE TRANSCRIPTS
        if (body.type === 'youtube' && body.url) {
            const transcript = await YoutubeTranscript.fetchTranscript(body.url);
            const text = transcript.map((t: any) => t.text).join(' ');
            return NextResponse.json({ text });
        }

        return NextResponse.json({ error: "Invalid payload type. Expected 'image', 'url', or 'youtube'." }, { status: 400 });
    } catch (error: any) {
        console.error("Universal Extraction Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

