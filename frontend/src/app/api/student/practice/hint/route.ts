import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { questionContent, currentAttempt } = await req.json();

    const prompt = `
      You are "Doubt Buddy AI", a helpful math tutor for Sindhu's Mathswiz Classes.
      A student is stuck on the following question: 
      "${questionContent}"
      
      The student has tried: "${currentAttempt || 'No attempt yet'}"
      
      CRITICAL INSTRUCTION: DO NOT GIVE THE FULL SOLUTION OR THE FINAL ANSWER.
      Provide a SINGLE, STRATEGIC HINT that helps the student think about the next step or a relevant formula.
      Use LaTeX for any math, wrapped in $ for inline or $$ for display.
      Keep the tone encouraging and brief (max 2-3 sentences).
    `;

    const response = await openai.chat.completions.create({
      model: 'google/gemini-2.0-flash-001', // Efficient and fast for hints
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });

    const hint = response.choices[0].message?.content || "I'm having trouble thinking of a hint right now. Try reviewing the core formula for this topic!";

    return NextResponse.json({ hint });
  } catch (error: any) {
    console.error("Doubt Buddy Error:", error);
    return NextResponse.json({ error: "Doubt Buddy is taking a nap. Try again in a bit!" }, { status: 500 });
  }
}

