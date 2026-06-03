import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const fetchFromBalancedLLM = async (systemPrompt: string, userPrompt: string) => {
    // ROBUST KEY EXTRACTION (Checks singular, indexed, and plural versions)
    const groqKeys = [
        process.env.GROQ_API_KEY, 
        ...(process.env.GROQ_API_KEYS || "").split(",")
    ].map(k => k?.trim()).filter(Boolean);

    const geminiKeys = [
        process.env.GEMINI_API_KEY, 
        process.env.GEMINI_API_KEY_1, 
        process.env.GEMINI_API_KEY_2, 
        ...(process.env.GEMINI_API_KEYS || "").split(",")
    ].map(k => k?.trim()).filter(Boolean);

    const availableProviders = [...(groqKeys.length > 0 ? ["GROQ"] : []), ...(geminiKeys.length > 0 ? ["GEMINI"] : [])];
    
    if (availableProviders.length === 0) throw new Error("No API keys found in .env.local");

    const provider = availableProviders[Math.floor(Math.random() * availableProviders.length)];
    const safeUserPrompt = userPrompt.length > 25000 ? userPrompt.substring(0, 25000) + "\n...[Context Truncated for Length]" : userPrompt;

    if (provider === "GROQ") {
        const key = groqKeys[Math.floor(Math.random() * groqKeys.length)];
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST", headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: safeUserPrompt }], response_format: { type: "json_object" } })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`Groq API Error: ${data.error?.message || res.statusText}`);
        if (!data.choices || !data.choices[0]) throw new Error("Invalid response format from Groq API.");
        return data.choices[0].message.content;
    } else {
        const key = geminiKeys[Math.floor(Math.random() * geminiKeys.length)];
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ parts: [{ text: safeUserPrompt }] }], generationConfig: { responseMimeType: "application/json" } })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`Gemini API Error: ${data.error?.message || res.statusText}`);
        if (!data.candidates || !data.candidates[0]) throw new Error("Invalid response format from Gemini API.");
        return data.candidates[0].content.parts[0].text;
    }
};

export async function POST(req: Request) {
    try {
        const { prompt } = await req.json();
        if (!prompt) return NextResponse.json({ error: "Prompt is required" }, { status: 400 });

        const systemPrompt = `You are a test generation assistant. Extract the user's test requirements into a strict JSON array of filter objects. 
        EXPECTED FORMAT: { "filters": [ { "topic": "Calculus", "difficulty": "EASY", "type": "SINGLE_CHOICE", "count": 5 } ] }
        Map difficulty to: "EASY", "MEDIUM", "HARD". Map type to: "SINGLE_CHOICE", "MULTIPLE_CHOICE", "INTEGER", "TRUE_FALSE", "SUBJECTIVE", "SHORT_ANSWER", "LONG_ANSWER". If topic isn't specified, omit it.
        Return ONLY the JSON object. Do NOT wrap in markdown blocks.`;

        const rawContent = await fetchFromBalancedLLM(systemPrompt, prompt);
        
        let parsedData;
        try {
            const cleaned = rawContent.replace(/```json/gi, "").replace(/```/g, "").trim();
            parsedData = JSON.parse(cleaned);
        } catch (e) { throw new Error("Failed to parse AI JSON response"); }

        if (!parsedData.filters || !Array.isArray(parsedData.filters)) throw new Error("Invalid AI JSON structure");

        let finalQuestions: any[] = [];
        for (const filter of parsedData.filters) {
            const whereClause: any = { status: "APPROVED" };
            if (filter.topic) whereClause.topic = { contains: filter.topic, mode: 'insensitive' };
            if (filter.difficulty) whereClause.difficulty = filter.difficulty;
            if (filter.type) whereClause.type = filter.type;

            const matchedQuestions = await prisma.question.findMany({
                where: whereClause, take: filter.count || 5,
            });
            finalQuestions = finalQuestions.concat(matchedQuestions);
        }

        return NextResponse.json({ success: true, questions: finalQuestions });
    } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 500 }); }
}

