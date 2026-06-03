import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

// Load Balancer Helper
const fetchFromBalancedLLM = async (systemPrompt: string, messages: any[]) => {
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
                model: "llama-3.1-8b-instant", 
                messages: [{ role: "system", content: systemPrompt }, ...messages]
            })
        });
        if (!res.ok) throw new Error("Groq API failed");
        const data = await res.json();
        return data.choices[0].message.content;
    } else {
        const key = geminiKeys[Math.floor(Math.random() * geminiKeys.length)];
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key.trim()}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: messages.map(m => ({ 
                    role: m.role === 'assistant' ? 'model' : m.role, 
                    parts: [{ text: m.content }] 
                }))
            })
        });
        if (!res.ok) throw new Error("Gemini API failed");
        const data = await res.json();
        return data.candidates[0].content.parts[0].text;
    }
};

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { messages, questionContext } = await req.json();

        const systemPrompt = `You are "Doubt Buddy," a specialized Socratic Mathematics Tutor for Sindhu's Mathswiz Classes.
        
        ### MISSION:
        Do NOT simply give the answer. Instead, guide the student to discover the solution themselves.
        If a student is stuck on a specific question, first ask them what they have tried. 
        Then, give a small "hint" or ask a leading question related to the underlying concept.
        
        ### QUESTION CONTEXT:
        ${questionContext || "No specific question provided. Help the student with their general mathematical query."}
        
        ### RULES:
        1. Always use LaTeX ($...$ for inline, $$...$$ for display) for all math.
        2. Be encouraging, but remain a strict academic mentor.
        3. Keep responses concise and focused on one step at a time.
        4. If the student gets it right, praise them and ask if they understand why it worked.
        
        Output only the tutor message.`;

        const response = await fetchFromBalancedLLM(systemPrompt, messages);
        return NextResponse.json({ success: true, message: response });

    } catch (error: any) {
        console.error("Doubt Buddy Chat Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

