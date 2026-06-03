import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import * as cheerio from 'cheerio';

const appendLog = async (jobId: string, message: string) => {
  const job = await prisma.ingestionJob.findUnique({ where: { id: jobId } });
  const currentLogs = Array.isArray(job?.logs) ? job.logs : [];
  await prisma.ingestionJob.update({
    where: { id: jobId },
    data: { logs: [...currentLogs, `[${new Date().toLocaleTimeString()}] ${message}`] },
  });
};

const fetchFromLLM = async (systemPrompt: string, userPrompt: string): Promise<string> => {
  const keys = [
    ...(process.env.OPENAI_API_KEY ? [process.env.OPENAI_API_KEY] : []),
    ...(process.env.OPENAI_API_KEY_1 ? [process.env.OPENAI_API_KEY_1] : []),
    ...(process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY] : []),
    ...(process.env.GEMINI_API_KEY_1 ? [process.env.GEMINI_API_KEY_1] : []),
    ...(process.env.TOGETHER_API_KEY ? [process.env.TOGETHER_API_KEY] : []),
    ...(process.env.OPENROUTER_API_KEY ? [process.env.OPENROUTER_API_KEY] : []),
  ].filter(Boolean);

  if (keys.length === 0) throw new Error("No LLM API keys configured");

  const apiKey = keys[Math.floor(Math.random() * keys.length)];

  if (apiKey.startsWith("sk-proj-")) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
    const data = await res.json();
    return data.choices[0].message.content;
  }

  if (apiKey.startsWith("AIza")) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
  }

  const res = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`Together API error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
};

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const userRole = (session.user as { role: string }).role;

    const body = await request.json().catch(() => ({}));
    const { indexUrl, folderId } = body;

    if (!indexUrl || !folderId) {
      return NextResponse.json({ success: false, error: "indexUrl and folderId are required" }, { status: 400 });
    }

    try {
      new URL(indexUrl);
    } catch {
      return NextResponse.json({ success: false, error: "Invalid URL format" }, { status: 400 });
    }

    const folder = await prisma.knowledgeFolder.findUnique({ where: { id: folderId } });
    if (!folder) {
      return NextResponse.json({ success: false, error: "Target folder not found" }, { status: 404 });
    }

    if (userRole === 'TEACHER' && folder.userId !== userId) {
      return NextResponse.json({ success: false, error: "You can only extract data into folders you created." }, { status: 403 });
    }

    const job = await prisma.ingestionJob.create({
      data: {
        userId,
        sourceType: "RECURSIVE_URL",
        sourceUrl: indexUrl,
        status: "PROCESSING",
        logs: [`[${new Date().toLocaleTimeString()}] Starting recursive web spider on: ${indexUrl}`],
      },
    });

    const response = await fetch(indexUrl);
    if (!response.ok) throw new Error("Failed to load index URL");

    const html = await response.text();
    const $ = cheerio.load(html);
    const extractedLinks = new Set<string>();
    const baseUrl = new URL(indexUrl).origin;

    $('a').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        try {
          const absoluteUrl = new URL(href, baseUrl).href;
          if (absoluteUrl.startsWith(baseUrl) &&
            (absoluteUrl.toLowerCase().includes('test') ||
              absoluteUrl.toLowerCase().includes('mcq') ||
              absoluteUrl.toLowerCase().includes('chapter'))) {
            extractedLinks.add(absoluteUrl);
          }
        } catch { /* ignore */ }
      }
    });

    const validLinks = Array.from(extractedLinks).slice(0, 150);
    await prisma.ingestionJob.update({
      where: { id: job.id },
      data: { totalItems: validLinks.length, processedItems: 0, progress: 0 },
    });
    await appendLog(job.id, `Discovered ${validLinks.length} valid test links.`);

    let totalQuestionsSaved = 0;

    for (let i = 0; i < validLinks.length; i++) {
      const targetUrl = validLinks[i];

      try {
        const jinaRes = await fetch(`https://r.jina.ai/${targetUrl}`);
        if (!jinaRes.ok) {
          await appendLog(job.id, `Skipped ${targetUrl} (Jina AI failed)`);
        } else {
          const markdownText = await jinaRes.text();
          const safeMarkdown = markdownText.substring(0, 25000);

          const systemPrompt = `You are a strict mathematical data extractor. Extract EVERY SINGLE question from this text. DO NOT SUMMARIZE.
Format as a STRICT JSON array: {"questions": [{"content": "...", "type": "SINGLE_CHOICE", "options": ["A", "B", "C", "D"], "correctAnswer": "A", "explanation": "...", "tags": ["Auto-Scraped"]}]}
Use $ and $$ for LaTeX. Group options correctly.`;

          const rawResponse = await fetchFromLLM(systemPrompt, `Raw Text:\n${safeMarkdown}`);
          const cleaned = rawResponse.replace(/```json/gi, "").replace(/```/g, "").trim();
          const parsed = JSON.parse(cleaned);
          const questions = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.data || []);

          for (const q of questions) {
            await prisma.question.create({
              data: {
                content: q.content || "",
                options: q.options || [],
                correctAnswer: q.correctAnswer || "",
                explanation: q.explanation || "",
                tags: q.tags || [],
                type: q.type || "SINGLE_CHOICE",
                difficulty: q.difficulty || "MEDIUM",
                subject: q.subject || folder.subject || "Mathematics",
                class: q.class || folder.className || "Class 12",
                scope: userRole === 'TEACHER' ? 'TEACHER_PRIVATE' : 'PUBLIC',
                status: "DRAFT",
                originalRawText: targetUrl,
                sourceUrl: targetUrl,
                createdById: userId,
                knowledgeFolderId: folderId,
              },
            });
          }

          totalQuestionsSaved += questions.length;
          await appendLog(job.id, `Saved ${questions.length} questions from ${targetUrl}.`);
        }
      } catch (e) {
        await appendLog(job.id, `Failed to process ${targetUrl}: ${e instanceof Error ? e.message : "unknown error"}`);
      }

      const pct = Math.round(((i + 1) / validLinks.length) * 100);
      await prisma.ingestionJob.update({
        where: { id: job.id },
        data: { processedItems: i + 1, progress: pct },
      });
    }

    await prisma.ingestionJob.update({
      where: { id: job.id },
      data: { status: "COMPLETED", progress: 100 },
    });
    await appendLog(job.id, `SUCCESS: Web spider finished. Saved ${totalQuestionsSaved} total questions to Drafts.`);

    return NextResponse.json({ success: true, jobId: job.id, saved: totalQuestionsSaved });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[INGEST-SPIDER] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
