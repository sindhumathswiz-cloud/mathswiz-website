import { NextResponse } from "next/server";
import { normalizeExtractedQuestions } from "@/lib/extract-normalizer";

// ─── Stage 1: Image → LaTeX via Mathpix OCR (free tier, best-in-class math OCR) ─
const mathpixOcr = async (fileBase64: string): Promise<string> => {
    if (!process.env.MATHPIX_APP_ID || !process.env.MATHPIX_APP_KEY) {
        throw new Error("Mathpix credentials missing. Set MATHPIX_APP_ID and MATHPIX_APP_KEY.");
    }
    const res = await fetch("https://api.mathpix.com/v3/text", {
        method: "POST",
        headers: {
            "app_id": process.env.MATHPIX_APP_ID,
            "app_key": process.env.MATHPIX_APP_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ src: fileBase64, formats: ["text", "data"], data_options: { include_latex: true } }),
    });
    const data = await res.json();
    if (data.error) throw new Error(`Mathpix error: ${data.error}`);
    return (data.text ?? "").trim();
};

// ─── Groq JSON chat helper (free, strong reasoner — replaces paid OpenRouter) ─
const groqJsonChat = async (prompt: string): Promise<unknown> => {
    if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set.");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "openai/gpt-oss-120b",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0,
        }),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`Groq error: ${errData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
};

// ─── Stage 2: LaTeX → structured questions via Groq gpt-oss-120b (free, strong reasoner) ─
const structureWithGroq = async (rawText: string): Promise<unknown> => {
    if (!rawText) return { questions: [] };

    const prompt = `You are a math question structurer. Below is OCR'd LaTeX text from an image containing one or more math questions. Convert it into structured JSON.

Output ONLY a valid JSON object of this exact shape (use these exact keys):
{ "questions": [ { "questionContent": "string", "options": ["string"], "correctAnswer": "string", "explanation": "string", "tags": ["string"] } ] }

FIELD RULES:
- questionContent: the FULL question stem (prose + equations). Keep all LaTeX. Wrap every equation/variable/fraction in single $ for inline math and $$ for display math.
- options: array of the option texts in order, WITHOUT the "(A)" / "A." labels. Use [] if the question is not multiple-choice.
- correctAnswer: for multiple-choice, the option LETTER only (A, B, C or D). For numeric/subjective questions, the answer value.
  CRITICAL: if the source text does NOT contain the answer and you cannot determine it with certainty, return "". NEVER guess or fabricate an answer.
- explanation: any worked solution or steps present in the source. NEVER put the solution inside questionContent.
- tags: short topic tags if obvious, otherwise [].

SEGMENTATION RULES:
- Emit exactly ONE object per distinct QUESTION.
- Do NOT emit a separate object for a lone equation, an option, or an answer line — attach those to their question.

Output ONLY the JSON object. No markdown fences, no commentary.

OCR TEXT:
${rawText}`;

    return groqJsonChat(prompt);
};

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
4. correctAnswer: only include it if the source states or clearly implies it; otherwise use "". NEVER fabricate an answer.
5. Output ONLY the valid JSON object. No markdown fences, no commentary.

RAW TEXT TO PROCESS:\n${rawText}`;

    const parsed = await groqJsonChat(prompt) as { questions?: unknown[] };
    return parsed.questions ?? (Array.isArray(parsed) ? parsed : []);
};

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
    try {
        const body = await req.json();

        // ── ROUTE A: Word doc / raw text (from /api/extract-word) ────────────
        if (body.type === "text" && body.rawText) {
            if (!process.env.GROQ_API_KEY) {
                return NextResponse.json({ error: "GROQ_API_KEY is not set." }, { status: 500 });
            }
            const questions = await structureWithAI(body.rawText);
            return NextResponse.json(questions);
        }

        // ── ROUTE B: Image / Snippet — Mathpix OCR → Groq structuring (free pipeline) ──
        if (body.fileBase64) {
            // Stage 1: image → LaTeX (Mathpix). Stage 2: LaTeX → structured JSON (Groq gpt-oss-120b).
            const latex = await mathpixOcr(body.fileBase64);
            const structured = await structureWithGroq(latex);
            // Stage 3: normalize to the canonical schema the client reads, dropping fragments.
            const questions = normalizeExtractedQuestions(structured);
            return NextResponse.json(questions);
        }

        return NextResponse.json({ error: "Invalid payload: provide fileBase64 or { type: 'text', rawText }" }, { status: 400 });

    } catch (error: any) {
        console.error("[extract-vision]", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

