import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { structureQuestions } from "@/lib/structure-questions";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const role = (session.user as any).role;
        if (role !== 'ADMIN' && role !== 'TEACHER') {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();

        // --- ROUTE A: TEXT, URL, OR WORD DOCUMENT ---
        if (body.type === 'text' && body.rawText) {
            if (!process.env.GROQ_API_KEY) {
                return NextResponse.json({ error: "GROQ_API_KEY is not set." }, { status: 500 });
            }
            return NextResponse.json(await structureQuestions(body.rawText));
        }

        // --- ROUTE B: SINGLE IMAGE (MATHPIX OCR -> Groq structuring) ---
        if (body.fileBase64) {
            if (!process.env.MATHPIX_APP_ID || !process.env.MATHPIX_APP_KEY) {
                return NextResponse.json({ error: "Mathpix credentials missing." }, { status: 500 });
            }

            const mathpixRes = await fetch("https://api.mathpix.com/v3/text", {
                method: "POST",
                headers: {
                    "app_id": process.env.MATHPIX_APP_ID,
                    "app_key": process.env.MATHPIX_APP_KEY,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ src: body.fileBase64, formats: ["text", "data"], data_options: { include_latex: true } })
            });

            const mathpixData = await mathpixRes.json();
            if (mathpixData.error) throw new Error(mathpixData.error);

            return NextResponse.json(await structureQuestions(mathpixData.text));
        }

        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
