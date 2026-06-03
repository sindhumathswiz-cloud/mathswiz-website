import { NextResponse } from "next/server";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
    try {
        const { imageBase64 } = await req.json();
        if (!imageBase64) return NextResponse.json({ error: "No image provided" }, { status: 400 });

        const prompt = "You are a math extraction assistant. Analyze this image. Extract the math question, the multiple choice options (if any), the correct answer (if obvious), and step-by-step explanation. Format EXACTLY as a raw JSON object with keys: questionContent, options (array of strings), correctAnswer, explanation. Use LaTeX for math and ALWAYS wrap math expressions in single '$' delimiters for both inline and display math (e.g. $x^2 + y^2 = z^2$). DO NOT wrap the response in markdown blocks like ```json.";

        const safeParse = (text: string) => {
            try {
                const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
                return JSON.parse(cleaned);
            } catch (e) {
                console.error("JSON Parse Error. Raw text:", text);
                throw new Error("Failed to parse AI output as JSON");
            }
        };

        // 1. OPENAI
        if (process.env.OPENAI_API_KEY) {
            try {
                const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [{
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            { type: "image_url", image_url: { url: imageBase64 } }
                        ]
                    }],
                    response_format: { type: "json_object" }
                });
                return NextResponse.json(safeParse(response.choices[0].message.content || "{}"));
            } catch (e: any) {
                console.error("OpenAI failed:", e.message);
            }
        }

        // 2. GEMINI (Aggressive Array Router)
        const geminiKeys = [
            process.env.GEMINI_API_KEY,
            process.env.GEMINI_API_KEY_1,
            process.env.GEMINI_API_KEY_2
        ].filter(Boolean);

        for (const key of geminiKeys) {
            const genAI = new GoogleGenerativeAI(key as string);
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", generationConfig: { responseMimeType: "application/json" } });
                const base64Data = imageBase64.split(',')[1];
                const mimeType = imageBase64.split(';')[0].split(':')[1];
                const result = await model.generateContent([
                    prompt,
                    { inlineData: { data: base64Data, mimeType } }
                ]);
                return NextResponse.json(safeParse(result.response.text()));
            } catch (e: any) {
                console.error(`Gemini failed:`, e.message);
            }
        }

        return NextResponse.json({ error: "All AI providers failed or were not configured." }, { status: 500 });
    } catch (error: any) {
        console.error("Extract Question Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

