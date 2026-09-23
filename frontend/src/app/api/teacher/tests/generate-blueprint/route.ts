import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { selectQuestionsByFilters } from "@/lib/question-selection";

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
            // llama-3.1-8b-instant was retired by Groq (404 model_not_found);
            // openai/gpt-oss-120b is confirmed working (see lib/llm.ts).
            body: JSON.stringify({ model: "openai/gpt-oss-120b", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: safeUserPrompt }], response_format: { type: "json_object" } })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`Groq API Error: ${data.error?.message || res.statusText}`);
        if (!data.choices || !data.choices[0]) throw new Error("Invalid response format from Groq API.");
        return data.choices[0].message.content;
    } else {
        const key = geminiKeys[Math.floor(Math.random() * geminiKeys.length)];
        // gemini-2.0-flash was also retired; gemini-3.5-flash / gemini-2.5-flash
        // are confirmed working (lib/llm.ts).
        let res: Response | null = null;
        let data: any = null;
        for (const model of ["gemini-3.6-flash", "gemini-3.5-flash"]) {
            res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ parts: [{ text: safeUserPrompt }] }], generationConfig: { responseMimeType: "application/json" } })
            });
            data = await res.json();
            if (res.ok) break;
        }
        if (!res || !res.ok) throw new Error(`Gemini API Error: ${data?.error?.message || res?.statusText}`);
        if (!data.candidates || !data.candidates[0]) throw new Error("Invalid response format from Gemini API.");
        return data.candidates[0].content.parts[0].text;
    }
};

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const userId = session?.user?.id;
        const role = session?.user?.role;
        if (!userId || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (role !== "TEACHER" && role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

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

        const finalQuestions = await selectQuestionsByFilters(parsedData.filters);

        return NextResponse.json({ success: true, questions: finalQuestions });
    } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 500 }); }
}

