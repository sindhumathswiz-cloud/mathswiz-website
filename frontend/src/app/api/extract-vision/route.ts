import { NextResponse } from "next/server";

// ─── Shared: Structure raw text into our JSON schema via LLM ─────────────────
const structureWithAI = async (rawText: string): Promise<any[]> => {
    const prompt = `You are a data structuring assistant. Extract ALL multiple-choice or subjective math questions from this text.
You MUST output a valid JSON object containing a SINGLE key called "questions". The value must be an array of question objects.

EXPECTED JSON STRUCTURE:
{
  "questions": [
    {
      "content": "The value of $f(x) = \\int x^2 dx$ is",
      "options": ["$\\frac{x^3}{3} + C$", "$2x$", "$x^3 + C$", "$x^2 + C$"],
      "correctAnswer": "A",
      "explanation": "Using the power rule of integration.",
      "tags": ["Calculus"]
    }
  ]
}

RULES:
1. Group options (a, b, c, d) into the 'options' array. Do NOT make them separate questions.
2. Maintain all LaTeX formatting exactly.
3. CRITICAL LaTeX RULE: You MUST wrap ALL mathematical equations, variables, functions, and fractions in single $ for inline math and double $$ for display math. The web scraper may have stripped these. You MUST re-apply them. For example, 'Solve for x' MUST become 'Solve for $x$'. 'f(x) = 2x + 3' MUST become '$f(x) = 2x + 3$'.
4. Output ONLY the valid JSON object. No markdown fences, no commentary.

RAW TEXT TO PROCESS:\n${rawText}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "google/gemini-1.5-flash",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        })
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(`OpenRouter error: ${errData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return parsed.questions ?? (Array.isArray(parsed) ? parsed : []);
};

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
    try {
        const body = await req.json();

        // ── ROUTE A: Word doc / raw text (from /api/extract-word) ────────────
        if (body.type === "text" && body.rawText) {
            if (!process.env.OPENROUTER_API_KEY) {
                return NextResponse.json({ error: "OPENROUTER_API_KEY is not set." }, { status: 500 });
            }
            const questions = await structureWithAI(body.rawText);
            return NextResponse.json(questions);
        }

        // ── ROUTE B: Image / Snippet via Vision AI (Teacher Studio - No Mathpix) ──
        if (body.fileBase64) {
             if (!process.env.OPENROUTER_API_KEY) {
                return NextResponse.json({ error: "OPENROUTER_API_KEY is not set." }, { status: 500 });
            }

            const visionPrompt = `You are a math question extractor. 
            Look at the attached image and extract ALL math questions.
            You MUST output a valid JSON object with a "questions" key.
            Follow these rules:
            1. Preserve ALL LaTeX.
            2. CRITICAL LaTeX RULE: You MUST wrap ALL mathematical equations, variables, functions, and fractions in single $ for inline math and double $$ for display math. The web scraper may have stripped these. You MUST re-apply them. For example, 'Solve for x' MUST become 'Solve for $x$'. 'f(x) = 2x + 3' MUST become '$f(x) = 2x + 3$'.
            3. Group options (a, b, c, d) together.
            4. Extract solution/explanation if present.
            5. Output ONLY JSON.`;

            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "google/gemini-1.5-flash", // Use a vision-capable, cost-effective model
                    messages: [
                        {
                            role: "user",
                            content: [
                                { type: "text", text: visionPrompt },
                                {
                                    type: "image_url",
                                    image_url: { url: body.fileBase64 }
                                }
                            ]
                        }
                    ],
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(`Vision AI error: ${errData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content ?? "{}";
            const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(cleaned);
            return NextResponse.json(parsed.questions ?? (Array.isArray(parsed) ? parsed : []));
        }

        return NextResponse.json({ error: "Invalid payload: provide fileBase64 or { type: 'text', rawText }" }, { status: 400 });

    } catch (error: any) {
        console.error("[extract-vision]", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

