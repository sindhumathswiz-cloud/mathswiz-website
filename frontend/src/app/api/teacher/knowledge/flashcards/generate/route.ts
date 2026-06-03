import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

// Re-use the LLM load balancer logic
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

    let provider = availableProviders[Math.floor(Math.random() * availableProviders.length)];
    
    // 🧠 SMART LLM ROUTING: Groq free tier has a strict 6,000 TPM / ~15k char limit.
    // Gemini 1.5 Flash handles 1,000,000 tokens. 
    // Automatically failover massive context strings to Gemini to prevent size crashes.
    const totalChars = systemPrompt.length + userPrompt.length;
    if (totalChars > 15000 && geminiKeys.length > 0) {
        provider = "GEMINI";
    }

    // Still enforce a hard cap if somehow only Groq is available
    const maxSystemLength = provider === "GROQ" ? 12000 : 80000;
    const safeSystemPrompt = systemPrompt.length > maxSystemLength ? systemPrompt.substring(0, maxSystemLength) + "\n...[Context Truncated for Length]" : systemPrompt;
    
    const maxUserLength = provider === "GROQ" ? 2000 : 80000;
    const safeUserPrompt = userPrompt.length > maxUserLength ? userPrompt.substring(0, maxUserLength) + "\n...[Context Truncated for Length]" : userPrompt;

    if (provider === "GROQ") {
        const key = groqKeys[Math.floor(Math.random() * groqKeys.length)];
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST", headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "system", content: safeSystemPrompt }, { role: "user", content: safeUserPrompt }], response_format: { type: "json_object" } })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`Groq API Error: ${data.error?.message || res.statusText}`);
        if (!data.choices || !data.choices[0]) throw new Error("Invalid response format from Groq API.");
        return data.choices[0].message.content;
    } else {
        const key = geminiKeys[Math.floor(Math.random() * geminiKeys.length)];
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ systemInstruction: { parts: [{ text: safeSystemPrompt }] }, contents: [{ parts: [{ text: safeUserPrompt }] }], generationConfig: { responseMimeType: "application/json" } })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`Gemini API Error: ${data.error?.message || res.statusText}`);
        if (!data.candidates || !data.candidates[0]) throw new Error("Invalid response format from Gemini API.");
        return data.candidates[0].content.parts[0].text;
    }
};

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;
        
        if (!userId || (session?.user as any)?.role !== "TEACHER") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { folderId } = await req.json();
        if (!folderId) return NextResponse.json({ error: "Folder ID required" }, { status: 400 });

        const folder = await prisma.knowledgeFolder.findUnique({
            where: { id: folderId, userId: userId },
            include: { documents: { where: { isActive: true } } }
        });

        if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
        if (folder.documents.length === 0) return NextResponse.json({ error: "Folder contains no documents to extract flashcards from." }, { status: 400 });

        const contextString = folder.documents.map(d => d.content).join("\n\n").substring(0, 50000); // 50k char limit

        const systemPrompt = `You are an expert Math teacher creating high-impact flashcards.
CURRICULUM CONTEXT:
${contextString}

TASK: Extract EXACTLY 5 key concepts, formulas, or short axioms from the curriculum context and structure them as flashcards.
Format:
"front": A concise question, formula name, or concept prompt. (supports LaTeX with $, e.g. $x^2$)
"back": The concise answer, core formula, or explanation. (supports LaTeX)

You MUST return a STRICT JSON object containing purely an array called "flashcards".
Example:
{
  "flashcards": [
     { "front": "Derivative of $\\sin(x)$", "back": "$\\cos(x)$" }
  ]
}`;

        const rawContent = await fetchFromBalancedLLM(systemPrompt, "Process the context and generate 5 flashcards now.");
        
        let newFlashcards = [];
        try {
            const cleaned = rawContent.replace(/```json/gi, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(cleaned);
            newFlashcards = Array.isArray(parsed) ? parsed : (parsed.flashcards || parsed.data || []);
            newFlashcards = newFlashcards.slice(0, 5);
        } catch (e) {
            console.error("Failed to parse flashcard JSON", e);
            throw new Error("AI returned malformed data.");
        }

        if (newFlashcards.length === 0) throw new Error("No flashcards were generated.");

        // Clear old flashcards to prevent duplicates
        await prisma.flashcard.deleteMany({ where: { folderId } });

        // Save new flashcards to Database
        await prisma.flashcard.createMany({
            data: newFlashcards.map((f: any) => ({
                folderId,
                front: f.front || "",
                back: f.back || ""
            }))
        });

        const flashcards = await prisma.flashcard.findMany({ where: { folderId } });

        return NextResponse.json({ success: true, count: flashcards.length, flashcards });

    } catch (error: any) {
        console.error("Flashcard Gen Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
