import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * DAILY TOKEN REFRESH SCRIPT
 * -------------------------
 * Resets AI Practice Tokens for all 'FREE' students back to 5.
 * Run this nightly via Cron or manual execution:
 * `npx ts-node src/scripts/refresh-tokens.ts`
 */
async function refreshTokens() {
  console.log("🚀 Starting Daily Token Refresh...");
  
  try {
    const result = await prisma.user.updateMany({
      where: { 
        subscription: "FREE", 
        role: "STUDENT" 
      },
      data: { 
        aiTokens: 5 
      }
    });

    console.log(`✅ SUCCESS: Refreshed energy for ${result.count} student(s).`);
  } catch (error) {
    console.error("❌ ERROR: Failed to refresh tokens:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

refreshTokens();
