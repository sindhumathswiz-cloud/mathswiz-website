import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

// Re-use the same load balancer logic from Task 4
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
        // IDENTITY HEALING: Always use the standardized authOptions and check for ID
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;
        
        if (!userId) {
            console.error("[AUTH] Unauthorized generation attempt: No session ID found.");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Fetch deep user details directly from DB to ensure accurate metadata
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        const { topic, subtopic, type, count, difficulty, bypassTokens, documentIds, forceAI } = await req.json(); // bypassTokens for Teachers/Admins
        
        const requestedCount = Math.min(parseInt(count) || 5, 20); 
        if (!topic) return NextResponse.json({ error: "Topic is required" }, { status: 400 });
        
        // Ensure Type and Difficulty match Prisma Enums exactly
        const searchType = (type || "SINGLE_CHOICE").toUpperCase().replace(/\s+/g, '_') as any;
        const searchDiff = (difficulty || "MEDIUM").toUpperCase() as any;

        // 1. Query Database First (Bypass if forceAI is true)
        let dbQuestions: any[] = [];
        if (!forceAI) {
            dbQuestions = await prisma.question.findMany({
                where: { 
                    status: "APPROVED", 
                    type: searchType, 
                    difficulty: searchDiff, 
                    topic: { equals: topic, mode: 'insensitive' },
                    ...(subtopic ? { subTopic: { equals: subtopic, mode: 'insensitive' } } : {})
                },
                take: requestedCount
            });
        }

        const deficit = requestedCount - dbQuestions.length;
        if (deficit <= 0) return NextResponse.json({ success: true, questions: dbQuestions, generated: 0 });

        // 2. Monetization Check (Only for students)
        const isPremium = (user as any).subscription === "PREMIUM";
        const isAdminOrTeacher = user?.role === "TEACHER" || user?.role === "ADMIN";
        const tokens = (user as any).aiTokens ?? 5;
        
        if (deficit > 0 && !isPremium && !isAdminOrTeacher && !bypassTokens && tokens < 1) {
            return NextResponse.json({ error: "Out of AI Energy Tokens! Upgrade to Premium or practice existing questions." }, { status: 403 });
        }

        // 3. Fetch Specific Topic Folder/Document (RAG Context)
        let contextString = "";
        let autoTagFolderName = topic; // Default to the topic string
        
        if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
            // User selected specific documents
            const selectedDocs = await prisma.knowledgeDocument.findMany({
                where: { id: { in: documentIds }, isActive: true },
                include: { folder: true }
            });
            contextString = selectedDocs.map(d => d.content).join("\n\n");
            if (selectedDocs.length > 0 && selectedDocs[0].folder) {
                autoTagFolderName = selectedDocs[0].folder.topicName;
            }
        } else {
            // Fallback to topic name search
            const knowledgeFolders = await prisma.knowledgeFolder.findMany({
                where: { topicName: { contains: topic, mode: 'insensitive' } },
                include: { documents: { where: { isActive: true } } }
            });
            contextString = knowledgeFolders.flatMap(f => f.documents.map(d => d.content)).join("\n\n");
        }

        // 4. ANTI-REPETITION: Fetch recently generated questions on this topic to avoid duplicates
        const recentQuestions = await prisma.question.findMany({
            where: { topic: { contains: topic, mode: 'insensitive' } },
            select: { content: true },
            take: 15,
            orderBy: { createdAt: 'desc' }
        });
        const avoidList = recentQuestions.map(q => q.content).join("\n- ");

        // 5. LLM FALLBACK: Generate the missing questions (WITH DIRECT EXTRACTION INSTRUCTIONS)
        const systemPrompt = `You are a high-school mathematics question generator and extractor. 
        CURRICULUM CONTEXT (Books, Syllabi, Notes):
        ${contextString ? contextString : "Standard High School Curriculum."}
        
        ANTI-REPETITION CRITICAL RULE: DO NOT generate questions that are identical or highly similar to these existing ones:
        ${avoidList}
        
        TASK: Output EXACTLY ${deficit} questions on the topic "${topic}" (Subtopic: "${subtopic || 'General'}"). Format: ${searchType}. Target Difficulty: ${searchDiff}.
        
        EXTRACTION vs GENERATION RULE:
        1. If the provided CURRICULUM CONTEXT contains actual questions matching the requested topic/difficulty, you MUST extract them directly from the text and formulate full solutions for them.
        2. If the context does not contain enough direct questions, generate BRAND NEW, UNIQUE questions that are of a HIGHLY SIMILAR nature, style, and difficulty to the provided context.
        
        You MUST return a STRICT JSON array containing EXACTLY ${deficit} objects.
        Each object MUST have these exact keys:
        - "content": The question text. Use $ for inline LaTeX and $$ for display LaTeX.
        - "options": An array of 4 string options (if SINGLE_CHOICE or MULTIPLE_CHOICE). Leave empty [] if SUBJECTIVE/SHORT_ANSWER/LONG_ANSWER.
        - "correctAnswer": The exact string of the correct option (or the direct answer text).
        - "explanation": A detailed, step-by-step mathematical solution using LaTeX.
        - "topic": "${topic}"
        - "subTopic": "${subtopic || ''}"
        
        DO NOT wrap the response in markdown blocks. OUTPUT ONLY THE VALID JSON OBJECT with a "questions" array key: { "questions": [...] }`;

        const rawContent = await fetchFromBalancedLLM(systemPrompt, "Process the curriculum context and generate the questions now.");
        
        let newQuestions = [];
        try {
            const cleaned = rawContent.replace(/```json/gi, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(cleaned);
            newQuestions = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.data || []);
            newQuestions = newQuestions.slice(0, deficit);
        } catch (e) {
             console.error("Failed to parse deficit JSON", e);
        }

        // 6. Save new questions to Database (Auto-Approved & Auto-Tagged)
        const savedQuestions = [];
        const autoTags = ["AI-Generated", "Practice-Arena"];
        if (autoTagFolderName && !autoTags.includes(autoTagFolderName)) {
            autoTags.push(autoTagFolderName);
        }

        for (const nq of newQuestions) {
             try {
                 if (!nq.content) continue; // Skip malformed entries

                 const saved = await prisma.question.create({
                     data: {
                         content: nq.content, 
                         options: nq.options || [], 
                         correctAnswer: String(nq.correctAnswer || ""), 
                         explanation: nq.explanation || "",
                         tags: autoTags, 
                         type: searchType, 
                         difficulty: searchDiff, 
                         subject: "Mathematics", 
                         class: "Class 11/12",
                         topic: nq.topic || topic, 
                         subTopic: nq.subTopic || subtopic || "", 
                         status: "APPROVED",
                         createdById: user.id
                     }
                 });
                 savedQuestions.push(saved);
             } catch (dbErr) { 
                 console.error("[DATABASE ERROR] Failed to save AI question:", dbErr); 
             }
        }

        // 7. Deduct Token for Free Student Users
        if (!isPremium && !isAdminOrTeacher && !bypassTokens && savedQuestions.length > 0) {
            try {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { aiTokens: { decrement: 1 } }
                });
            } catch(e) { console.error("Token deduction failed") }
        }

        return NextResponse.json({ success: true, questions: [...dbQuestions, ...savedQuestions], generated: savedQuestions.length });

    } catch (error: any) {
        console.error("Practice Generation Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

