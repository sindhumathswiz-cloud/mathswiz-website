import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const structureWithAI = async (rawText: string) => {
    const prompt = `You are a world-class LaTeX data structuring assistant. Your mission is to extract math questions from raw text with PERFECT LaTeX formatting and strict JSON compatibility.

    ### ⚠️ AGGRESSIVE LaTeX DELIMITER RULES (MANDATORY):
    1. **INDIVIDUAL VARIABLE WRAPPING**: EVERY single mathematical variable, constant, or symbol MUST be wrapped in single '$' dollar signs. NO EXCEPTIONS. For example, 'Solve for x' MUST become 'Solve for $x$'.
    2. **EQUATIONS & FORMULAS**: Wrap ALL mathematical equations, functions, and fractions in single $ for inline math and double $$ for display math. For example, 'x^2 + y^2 = r^2' MUST become '$x^2 + y^2 = r^2$'.
    3. **DISPLAY MATH**: Wrap large equations, integrals, matrices, or complex fractions in double $$ dollar signs ($$\\int x dx$$). 
    4. **NO BARE MATH**: Do not leave any mathematical context unwrapped. 'n is a constant' -> '$n$ is a constant'.
    5. **UNICODE PURGING**: Convert all Unicode math (x², x³, ½, √, π) into strict LaTeX ($x^2$, $x^3$, $\\frac{1}{2}$, $\\sqrt{}$, $\\pi$).
    6. **DOUBLE BACKSLASH ESCAPING (CRITICAL)**: You MUST use DOUBLE BACKSLASHES for all LaTeX commands inside the JSON string (e.g., "\\\\frac{1}{2}", "\\\\sqrt{x}", "\\\\alpha"). This is because the result is inside a JSON string.
    
    ### 📤 EXPECTED JSON FORMAT:
    {
      "questions": [
        {
          "type": "SINGLE_CHOICE",
          "content": "A question with $x$ and $$\\int f(x)dx$$.",
          "options": ["$option 1$", "$option 2$", "$option 3$", "$option 4$"],
          "correctAnswer": "A",
          "explanation": "Solution with $math$.",
          "difficulty": "MEDIUM",
          "subject": "Math",
          "class": "10",
          "examType": "JEE",
          "tags": ["Calculus"]
        }
      ]
    }

    ### 🧪 INPUT TEXT:
    ${rawText}
`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { 
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, 
            "Content-Type": "application/json" 
        },
        body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        })
    });
    
    const data = await response.json();
    
    if (!data.choices || !data.choices[0]) {
        console.error("OpenRouter AI Error:", data);
        throw new Error(data.error?.message || "Failed to structure JSON. LLM returned invalid response.");
    }
    
    const content = data.choices[0].message.content;
    const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return parsed.questions || parsed;
};

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const role = (session.user as any).role;
        const userId = (session.user as any).id;

        // Only Admin and Teacher can use extraction
        if (role !== 'ADMIN' && role !== 'TEACHER') {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        
        // --- ROUTE A: TEXT, URL, OR WORD DOCUMENT ---
        if (body.type === 'text' && body.rawText) {
            const questions = await structureWithAI(body.rawText);
            
            // If teacher, add scope info to response
            const scope = role === 'TEACHER' ? 'TEACHER_PRIVATE' : 'PUBLIC';
            return NextResponse.json({ questions, scope, createdBy: userId });
        }
        
        // --- ROUTE B: IMAGE / PDF PAGE (MATHPIX OCR) ---
        if (body.fileBase64) {
            if (!process.env.MATHPIX_APP_ID || !process.env.MATHPIX_APP_KEY) {
                return NextResponse.json({ error: "Mathpix credentials missing." }, { status: 500 });
            }

            // 1. Send image to Mathpix for flawless LaTeX extraction
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
            
            // 2. Send the flawless text to LLM for JSON structuring and Auto-Tagging
            const questions = await structureWithAI(mathpixData.text);
            
            const scope = role === 'TEACHER' ? 'TEACHER_PRIVATE' : 'PUBLIC';
            return NextResponse.json({ questions, scope, createdBy: userId });
        }

        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

