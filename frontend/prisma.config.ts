import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js loads .env.local automatically at runtime, but the Prisma CLI does
// not — without this it can't see DATABASE_URL and every `prisma migrate`
// command fails with "datasource.url property is required". Load .env.local
// first (it wins), then .env as a fallback.
config({ path: [".env.local", ".env"] });

export default defineConfig({
    datasource: {
        url: process.env.DATABASE_URL!,
    },
});


