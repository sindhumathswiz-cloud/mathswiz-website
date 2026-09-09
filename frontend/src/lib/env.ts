import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url().default("postgresql://localhost:5432/mathswiz"),
  NEXTAUTH_URL: z.string().url().default("http://localhost:3000"),
  NEXTAUTH_SECRET: z.string().min(1),
  AZURE_AD_CLIENT_ID: z.string().optional(),
  AZURE_AD_CLIENT_SECRET: z.string().optional(),
  AZURE_AD_TENANT_ID: z.string().optional(),
  SUPER_ADMIN_EMAIL: z.string().email().optional(),
  MASTER_ADMIN_EMAIL: z.string().email().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  SUPABASE_PROJECT_REF: z.string().optional(),
  SUPABASE_ACCESS_TOKEN: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_API_KEY_1: z.string().optional(),
  OPENAI_API_KEY_2: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_API_KEY_1: z.string().optional(),
  GEMINI_API_KEY_2: z.string().optional(),
  GEMINI_API_KEY_3: z.string().optional(),
  TOGETHER_API_KEY: z.string().optional(),
  TOGETHER_API_KEY_1: z.string().optional(),
  MATHPIX_APP_ID: z.string().optional(),
  MATHPIX_APP_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  QB_MISTRAL_OCR_MODEL: z.string().optional(),
  // Text-completion model used by structure-questions.ts's Mistral fallback
  // (last resort after Gemini and Groq) -- distinct from QB_MISTRAL_OCR_MODEL
  // above, which is the image-to-markdown OCR model used only by the
  // benchmark harness.
  QB_MISTRAL_TEXT_MODEL: z.string().optional(),
  QB_PRIVATE_STORAGE_ROOT: z.string().optional(),
  // Book-ingestion PDF storage backend. Defaults to local disk (used
  // unchanged in development). Set to SUPABASE before deploying anywhere
  // with a non-persistent filesystem (e.g. Vercel) — see lib/book-storage.ts.
  QB_STORAGE_BACKEND: z.enum(['LOCAL_DISK', 'SUPABASE']).optional(),
  QB_STORAGE_BUCKET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    try {
      _env = envSchema.parse(process.env);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const missing = error.issues
          .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
          .join("\n");
        throw new Error(`Invalid environment variables:\n${missing}`);
      }
      throw error;
    }
  }
  return _env;
}
