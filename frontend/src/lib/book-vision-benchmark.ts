import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { z } from 'zod';
import { assertPrivatePageImagePath } from './book-storage';

export const BENCHMARK_PROMPT_VERSION = 'QB_PAGE_EXTRACTION_V1';
export type BenchmarkProvider = 'GEMINI_VISION' | 'MATHPIX_OCR';

const extractedPageSchema = z.object({
  pageType: z.enum(['QUESTION', 'ANSWER_KEY', 'SOLUTION', 'MIXED', 'CONTENT', 'UNKNOWN']),
  questions: z.array(z.object({
    printedNumber: z.string().nullable(),
    questionType: z.enum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'INTEGER', 'TRUE_FALSE', 'SUBJECTIVE', 'ASSERTION_REASONING', 'CASE_STUDY', 'UNKNOWN']),
    contentMmd: z.string(),
    options: z.array(z.object({ label: z.string(), contentMmd: z.string() })),
    answerMmd: z.string().nullable(),
    solutionMmd: z.string().nullable(),
    bbox: z.tuple([z.number().int().min(0).max(1000), z.number().int().min(0).max(1000), z.number().int().min(0).max(1000), z.number().int().min(0).max(1000)]).nullable(),
    hasFigure: z.boolean(),
    confidence: z.number().min(0).max(1),
  })).max(100),
  unresolvedItems: z.array(z.string()).max(100),
});

function geminiKeys() {
  return [...new Set([process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_1, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3, ...(process.env.GEMINI_API_KEYS || '').split(',')].map(key => key?.trim()).filter((key): key is string => Boolean(key)))];
}

function openAiKeys() {
  return [...new Set([process.env.OPENAI_API_KEY, process.env.OPENAI_API_KEY_1, process.env.OPENAI_API_KEY_2, ...(process.env.OPENAI_API_KEYS || '').split(',')].map(key => key?.trim()).filter((key): key is string => Boolean(key)))];
}

function imageMime(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function cleanJson(text: string) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

function structuredMetrics(data: z.infer<typeof extractedPageSchema>) {
  const optionQuestions = data.questions.filter(question => question.options.length > 0);
  return {
    detectedQuestions: data.questions.length,
    withPrintedNumber: data.questions.filter(question => question.printedNumber).length,
    withOptions: optionQuestions.length,
    withFourOptions: data.questions.filter(question => question.options.length === 4).length,
    withAnswer: data.questions.filter(question => question.answerMmd).length,
    withSolution: data.questions.filter(question => question.solutionMmd).length,
    withFigure: data.questions.filter(question => question.hasFigure).length,
    unresolvedItems: data.unresolvedItems.length,
    meanConfidence: data.questions.length ? Number((data.questions.reduce((total, question) => total + question.confidence, 0) / data.questions.length).toFixed(4)) : 0,
  };
}

export async function benchmarkGeminiVision(imagePath: string) {
  const safePath = assertPrivatePageImagePath(imagePath);
  const bytes = await readFile(safePath);
  const keys = geminiKeys();
  if (!keys.length) throw new Error('No Gemini API key is configured');
  const model = process.env.QB_GEMINI_VISION_MODEL || 'gemini-3.6-flash';
  const prompt = `You are transcribing one Class 11/12 mathematics book page for a question-bank QA benchmark.
Return JSON only. Preserve every mathematical expression in Mathpix Markdown/LaTeX. Preserve printed numbering and option labels exactly. Never solve, repair, or invent missing content. If the page contains answers or solutions, attach them only when their printed association is visible on this same page. Bounding boxes are [ymin,xmin,ymax,xmax], normalized 0-1000. If uncertain, record the issue in unresolvedItems and lower confidence.
JSON shape: {"pageType":"QUESTION|ANSWER_KEY|SOLUTION|MIXED|CONTENT|UNKNOWN","questions":[{"printedNumber":string|null,"questionType":"SINGLE_CHOICE|MULTIPLE_CHOICE|INTEGER|TRUE_FALSE|SUBJECTIVE|ASSERTION_REASONING|CASE_STUDY|UNKNOWN","contentMmd":string,"options":[{"label":string,"contentMmd":string}],"answerMmd":string|null,"solutionMmd":string|null,"bbox":[number,number,number,number]|null,"hasFigure":boolean,"confidence":number}],"unresolvedItems":[string]}`;
  // Pick one key deterministically per image. A failed or slow page must never be
  // resent through every configured key because the shadow run has a hard call cap.
  const key = keys[bytes[0] % keys.length];
  const client = new GoogleGenerativeAI(key);
  const generator = client.getGenerativeModel(
    { model, generationConfig: { responseMimeType: 'application/json', temperature: 0 } },
    { timeout: 90_000 },
  );
  const result = await generator.generateContent([{ inlineData: { data: bytes.toString('base64'), mimeType: imageMime(safePath) } }, { text: prompt }]);
  const rawText = result.response.text();
  const structured = extractedPageSchema.parse(JSON.parse(cleanJson(rawText)));
  return { model, rawOutput: { text: rawText }, structuredData: structured, metrics: structuredMetrics(structured) };
}

export async function benchmarkOpenAiVision(imagePath: string) {
  const safePath = assertPrivatePageImagePath(imagePath);
  const bytes = await readFile(safePath);
  const keys = openAiKeys();
  if (!keys.length) throw new Error('No OpenAI API key is configured');
  const model = process.env.QB_OPENAI_VISION_MODEL || 'gpt-4o';
  const prompt = `You are transcribing one Class 11/12 mathematics book page for a question-bank QA benchmark.
Return JSON only. Preserve every mathematical expression in LaTeX. Preserve printed numbering and option labels exactly. Never solve, repair, or invent missing content. If the page contains answers or solutions, attach them only when their printed association is visible on this same page. Bounding boxes are [ymin,xmin,ymax,xmax], normalized 0-1000. If uncertain, record the issue in unresolvedItems and lower confidence.
JSON shape: {"pageType":"QUESTION|ANSWER_KEY|SOLUTION|MIXED|CONTENT|UNKNOWN","questions":[{"printedNumber":string|null,"questionType":"SINGLE_CHOICE|MULTIPLE_CHOICE|INTEGER|TRUE_FALSE|SUBJECTIVE|ASSERTION_REASONING|CASE_STUDY|UNKNOWN","contentMmd":string,"options":[{"label":string,"contentMmd":string}],"answerMmd":string|null,"solutionMmd":string|null,"bbox":[number,number,number,number]|null,"hasFigure":boolean,"confidence":number}],"unresolvedItems":[string]}`;
  const key = keys[bytes[1] % keys.length];
  const openai = new OpenAI({ apiKey: key, timeout: 90_000, maxRetries: 0 });
  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:${imageMime(safePath)};base64,${bytes.toString('base64')}`, detail: 'high' } },
    ] }],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 16_000,
  });
  const rawText = response.choices[0]?.message?.content || '';
  const structured = extractedPageSchema.parse(JSON.parse(cleanJson(rawText)));
  return { model, rawOutput: response, structuredData: structured, metrics: structuredMetrics(structured) };
}

export async function benchmarkMathpixOcr(imagePath: string) {
  const safePath = assertPrivatePageImagePath(imagePath);
  if (!process.env.MATHPIX_APP_ID || !process.env.MATHPIX_APP_KEY) throw new Error('Mathpix credentials are not configured');
  const bytes = await readFile(safePath);
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: imageMime(safePath) }), path.basename(safePath));
  form.set('options_json', JSON.stringify({ formats: ['text', 'data'], include_line_data: true, rm_spaces: false, math_inline_delimiters: ['\\(', '\\)'], math_display_delimiters: ['\\[', '\\]'] }));
  const response = await fetch('https://api.mathpix.com/v3/text', { method: 'POST', headers: { app_id: process.env.MATHPIX_APP_ID, app_key: process.env.MATHPIX_APP_KEY }, body: form, signal: AbortSignal.timeout(90_000) });
  const output = await response.json();
  if (!response.ok || output.error) throw new Error(output.error || `Mathpix returned ${response.status}`);
  const text = typeof output.text === 'string' ? output.text : '';
  const questionMarkers = text.match(/(?:^|\n)\s*\d{1,4}[.)]/g) || [];
  const optionMarkers = text.match(/(?:^|\s)(?:\([A-Da-d]\)|[A-Da-d][.)])(?=\s)/g) || [];
  return {
    model: typeof output.version === 'string' ? output.version : 'v3/text',
    rawOutput: output,
    structuredData: null,
    metrics: { detectedQuestionMarkers: questionMarkers.length, detectedOptionMarkers: optionMarkers.length, lineCount: Array.isArray(output.line_data) ? output.line_data.length : 0, confidence: typeof output.confidence === 'number' ? output.confidence : null, confidenceRate: typeof output.confidence_rate === 'number' ? output.confidence_rate : null, outputCharacters: text.length },
  };
}

export async function benchmarkMistralOcr(imagePath: string) {
  const safePath = assertPrivatePageImagePath(imagePath);
  if (!process.env.MISTRAL_API_KEY) throw new Error('Mistral API key is not configured');
  const bytes = await readFile(safePath);
  const model = process.env.QB_MISTRAL_OCR_MODEL || 'mistral-ocr-latest';
  const response = await fetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      document: { type: 'image_url', image_url: `data:${imageMime(safePath)};base64,${bytes.toString('base64')}` },
      include_image_base64: false,
      include_blocks: true,
      confidence_scores_granularity: 'word',
      table_format: 'html',
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const output = await response.json() as { pages?: Array<{ markdown?: string; blocks?: unknown[]; confidence_scores?: unknown }>; error?: string; message?: string };
  if (!response.ok || output.error) throw new Error(output.error || output.message || `Mistral OCR returned ${response.status}`);
  const markdown = (output.pages || []).map(page => page.markdown || '').join('\n\n');
  const questionMarkers = markdown.match(/(?:^|\n)\s*(?:\d{1,4}[.)]|(?:Example|Ex\.)\s*\d+)/gi) || [];
  const optionMarkers = markdown.match(/(?:^|\s)(?:\([A-Da-d]\)|[A-Da-d][.)])(?=\s)/g) || [];
  const displayMath = markdown.match(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/g) || [];
  return {
    model,
    rawOutput: output,
    structuredData: null,
    metrics: {
      pageCount: output.pages?.length || 0,
      detectedQuestionMarkers: questionMarkers.length,
      detectedOptionMarkers: optionMarkers.length,
      displayMathBlocks: displayMath.length,
      blockCount: (output.pages || []).reduce((total, page) => total + (Array.isArray(page.blocks) ? page.blocks.length : 0), 0),
      outputCharacters: markdown.length,
    },
  };
}
