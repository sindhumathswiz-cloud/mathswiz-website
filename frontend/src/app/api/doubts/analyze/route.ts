import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

// Load Balancer Helper (Shared across all Step 3 modules)
const fetchFromBalancedLLM = async (systemPrompt: string, userPrompt: string) => {
    const groqKeys = (process.env.GROQ_API_KEYS || "").split(",").filter(k => k.trim() !== "");
    const geminiKeys = (process.env.GEMINI_API_KEYS || "").split(",").filter(k => k.trim() !== "");
    const availableProviders = [];
    if (groqKeys.length > 0) availableProviders.push("GROQ");
    if (geminiKeys.length > 0) availableProviders.push("GEMINI");
    if (availableProviders.length === 0) throw new Error("No API keys configured.");

    const provider = availableProviders[Math.floor(Math.random() * availableProviders.length)];

    if (provider === "GROQ") {
        const key = groqKeys[Math.floor(Math.random() * groqKeys.length)];
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${key.trim()}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                // llama-3.1-8b-instant was retired by Groq (404 model_not_found);
                // openai/gpt-oss-120b is confirmed working (see lib/llm.ts).
                model: "openai/gpt-oss-120b",
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
                response_format: { type: "json_object" }
            })
        });
        if (!res.ok) throw new Error("Groq API failed");
        const data = await res.json();
        return data.choices[0].message.content;
    } else {
        const key = geminiKeys[Math.floor(Math.random() * geminiKeys.length)];
        // gemini-1.5-flash and gemini-2.0-flash were both retired by Google;
        // gemini-3.5-flash / gemini-2.5-flash are confirmed working (lib/llm.ts).
        let res: Response | null = null;
        for (const model of ["gemini-3.6-flash", "gemini-3.5-flash"]) {
            res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key.trim()}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    contents: [{ parts: [{ text: userPrompt }] }],
                    generationConfig: { responseMimeType: "application/json" }
                })
            });
            if (res.ok) break;
        }
        if (!res || !res.ok) throw new Error("Gemini API failed");
        const data = await res.json();
        return data.candidates[0].content.parts[0].text;
    }
};

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const formData = await req.formData();
        const image = formData.get('image') as File;
        if (!image) return NextResponse.json({ error: "Image required" }, { status: 400 });

        // 1. Mathpix OCR
        const buffer = Buffer.from(await image.arrayBuffer());
        const base64 = buffer.toString('base64');
        
        const mathpixRes = await fetch("https://api.mathpix.com/v3/text", {
            method: "POST",
            headers: {
                "app_id": process.env.MATHPIX_APP_ID!,
                "app_key": process.env.MATHPIX_APP_KEY!,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                src: `data:${image.type};base64,${base64}`, 
                formats: ["text"],
                math_inline_delimiters: ["$", "$"],
                math_display_delimiters: ["$$", "$$"]
            })
        });
        const mathpixData = await mathpixRes.json();
        const extractedLatex = mathpixData.text || "";

        if (!extractedLatex.trim()) throw new Error("No mathematical content found.");

        // 2. LLM Resolution (Solve & Explain)
        const systemPrompt = `You are a high-level math educator. Solve the mathematical question provided.
        RETURN THE RESPONSE AS A STRICT JSON OBJECT:
        {
            "markdown_content": "The original question in LaTeX",
            "step_by_step_solution": "A detailed solution using display LaTeX",
            "topic": "Broad topic name",
            "difficulty": 2
        }
        Use $ for inline and $$ for display math. ONLY RETURN JSON.`;

        const rawJson = await fetchFromBalancedLLM(systemPrompt, `Question Content:\n${extractedLatex}`);
        
        const cleaned = rawJson.replace(/```json/gi, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleaned);

        return NextResponse.json({
            message: 'Doubt Resolved successfully',
            question: parsed
        });

    } catch (error: any) {
        console.error("Doubt Analyze Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

