import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter: adapter as any });

async function main() {
    console.log('🚀 Attempting to enable pgvector extension...');
    try {
        await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
        console.log('✅ pgvector extension enabled successfully!');
    } catch (err: any) {
        console.error('❌ Failed to enable pgvector:', err.message);
        console.log('💡 Note: This might be expected if you do not have superuser permissions. Please ensure vector is enabled in your Supabase SQL Editor.');
    } finally {
        await prisma.$disconnect();
    }
}

main();
