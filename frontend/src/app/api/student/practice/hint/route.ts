import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";
import { fetchFromLLM } from '@/lib/llm';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { questionContent, currentAttempt } = await req.json();

    const systemPrompt = `You are "Doubt Buddy AI", a helpful math tutor for Sindhu's Mathswiz Classes.
      Never give the full solution or final answer. Give one strategic hint in 2-3 encouraging sentences.
      Use LaTeX wrapped in $ for inline math or $$ for display math.`;
    const prompt = `
      A student is stuck on the following question: 
      "${questionContent}"
      
      The student has tried: "${currentAttempt || 'No attempt yet'}"
      
      Provide the next helpful hint.
    `;

    const hint = await fetchFromLLM(systemPrompt, prompt, { json: false });

    return NextResponse.json({ hint });
  } catch (error: any) {
    console.error("Doubt Buddy Error:", error);
    return NextResponse.json({ error: "Doubt Buddy is taking a nap. Try again in a bit!" }, { status: 500 });
  }
}

