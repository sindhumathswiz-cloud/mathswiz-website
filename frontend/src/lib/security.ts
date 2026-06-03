import { z } from "zod";

export const doubtAnalysisSchema = z.object({
  image: z.instanceof(File, { message: "Image is required" }),
});

export const questionExtractionSchema = z.object({
  content: z.string().min(10).max(50000),
  subject: z.string().optional(),
  classLevel: z.string().optional(),
});

export const practiceGenerateSchema = z.object({
  topic: z.string().min(1).max(100),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  count: z.number().int().min(1).max(20).default(5),
});

export const testBlueprintSchema = z.object({
  title: z.string().min(1).max(200),
  class: z.string().min(1).max(50),
  subject: z.string().min(1).max(100),
  topics: z.array(z.string()).min(1),
  totalQuestions: z.number().int().min(1).max(100),
});

export function sanitizeForLLM(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .replace(/\bignore\s+previous\s+instructions\b/gi, "")
    .replace(/\bsystem\s*prompt\b/gi, "")
    .trim();
}

export function validateFileSize(file: File, maxSizeMB: number): boolean {
  return file.size <= maxSizeMB * 1024 * 1024;
}

export function validateFileType(file: File, allowedTypes: string[]): boolean {
  return allowedTypes.includes(file.type) ||
    allowedTypes.includes(`*${file.name.slice(file.name.lastIndexOf("."))}`);
}
