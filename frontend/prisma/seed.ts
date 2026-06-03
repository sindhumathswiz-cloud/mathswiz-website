import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter: adapter as any });

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   SINDHU\'S MATHSWIZ — PHASE 3 DATABASE SEEDER       ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  // ─── PASSWORD ──────────────────────────────────────────────────────────────
  // Auth route (CredentialsProvider) does plain text comparison:
  //   credentials.password === user.password
  // So we store "123" as-is (no bcrypt hash needed).
  const password = '123';

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 1.5: SEED 5 TEST USERS
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 1. ADMIN USER: Sumod ──────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { mobileNumber: '9876543210' },
    update: {
      password,
      role: 'ADMIN',
      accountStatus: 'APPROVED',
      firstName: 'Sumod',
    },
    create: {
      mobileNumber: '9876543210',
      firstName: 'Sumod',
      lastName: '',
      password,
      role: 'ADMIN',
      accountStatus: 'APPROVED',
    },
  });
  console.log(`✅ ADMIN seeded:    Sumod       | Mobile: 9876543210 | ID: ${admin.id}`);

  // ── 2. TEACHER USER: Sindhu ───────────────────────────────────────────────
  const teacher = await prisma.user.upsert({
    where: { mobileNumber: '9876598765' },
    update: {
      password,
      role: 'TEACHER',
      accountStatus: 'APPROVED',
      firstName: 'Sindhu',
    },
    create: {
      mobileNumber: '9876598765',
      firstName: 'Sindhu',
      lastName: '',
      password,
      role: 'TEACHER',
      accountStatus: 'APPROVED',
    },
  });
  console.log(`✅ TEACHER seeded:  Sindhu      | Mobile: 9876598765 | ID: ${teacher.id}`);

  // ── 3. STUDENT 1 ──────────────────────────────────────────────────────────
  const student1 = await prisma.user.upsert({
    where: { mobileNumber: '9876511111' },
    update: {
      password,
      role: 'STUDENT',
      accountStatus: 'APPROVED',
      firstName: 'Student 1',
    },
    create: {
      mobileNumber: '9876511111',
      firstName: 'Student 1',
      lastName: '',
      password,
      role: 'STUDENT',
      accountStatus: 'APPROVED',
      subscription: 'FREE',
      aiTokens: 10,
    },
  });
  console.log(`✅ STUDENT seeded:  Student 1   | Mobile: 9876511111 | ID: ${student1.id}`);

  // ── 4. PARENT USER: Parent 1 ──────────────────────────────────────────────
  const parent1 = await prisma.user.upsert({
    where: { mobileNumber: '9876512345' },
    update: {
      password,
      role: 'PARENT',
      accountStatus: 'APPROVED',
      firstName: 'Parent 1',
    },
    create: {
      mobileNumber: '9876512345',
      firstName: 'Parent 1',
      lastName: '',
      password,
      role: 'PARENT',
      accountStatus: 'APPROVED',
    },
  });
  console.log(`✅ PARENT seeded:   Parent 1    | Mobile: 9876512345 | ID: ${parent1.id}`);

  // ── CRITICAL: Link Parent 1 → Student 1 via ParentLink table ──────────────
  await prisma.parentLink.upsert({
    where: {
      parentId_studentId: {
        parentId: parent1.id,
        studentId: student1.id,
      },
    },
    update: {},
    create: {
      parentId: parent1.id,
      studentId: student1.id,
    },
  });
  console.log(`🔗 ParentLink created: Parent 1 (${parent1.id}) → Student 1 (${student1.id})`);

  // ── 5. STUDENT 2 ──────────────────────────────────────────────────────────
  const student2 = await prisma.user.upsert({
    where: { mobileNumber: '9876522222' },
    update: {
      password,
      role: 'STUDENT',
      accountStatus: 'APPROVED',
      firstName: 'Student 2',
    },
    create: {
      mobileNumber: '9876522222',
      firstName: 'Student 2',
      lastName: '',
      password,
      role: 'STUDENT',
      accountStatus: 'APPROVED',
      subscription: 'PREMIUM',
      aiTokens: 100,
    },
  });
  console.log(`✅ STUDENT seeded:  Student 2   | Mobile: 9876522222 | ID: ${student2.id}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBAL BRANDING & HOME PAGE (preserved from original seed)
  // ═══════════════════════════════════════════════════════════════════════════

  const homeData = {
    instituteName: "Sindhu's Mathswiz Classes",
    instituteSubtext: "Excellence in Mathematics for JEE & Boards",
    logoUrl: "/logo.png",
    contactEmail: "contact@mathswiz.com",
    contactPhone: "+91 9876543210",
    address: "New Delhi, India",
    navTabs: [
      { label: "Home", href: "/" },
      { label: "Courses", href: "/courses" },
      { label: "Tests", href: "/tests" },
      { label: "About", href: "/about" }
    ],
    footerData: {
      socialLinks: { facebook: "#", twitter: "#", youtube: "#" },
      usefulLinks: [
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Terms of Service", href: "/terms" }
      ]
    }
  };

  await (prisma.sitePage as any).upsert({
    where: { slug: 'home' },
    update: {
      title: "Home",
      isPublished: true,
      isVisible: true,
      globalSettings: homeData,
      content: {
        blocks: [
          {
            id: "hero-1",
            type: "hero",
            title: "Master Mathematics with Sindhu's Classes",
            subtitle: "Personalized coaching for JEE Main, Advanced, and Board Exams.",
            ctaText: "Enroll Now",
            ctaLink: "/register"
          }
        ]
      }
    },
    create: {
      slug: 'home',
      title: "Home",
      isPublished: true,
      isVisible: true,
      globalSettings: homeData,
      content: {
        blocks: [
          {
            id: "hero-1",
            type: "hero",
            title: "Master Mathematics with Sindhu's Classes",
            subtitle: "Personalized coaching for JEE Main, Advanced, and Board Exams.",
            ctaText: "Enroll Now",
            ctaLink: "/register"
          }
        ]
      }
    },
  });
  console.log('✅ Global Branding (Home SitePage) ready.');

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║                 SEED COMPLETE                       ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  Role      Name        Mobile       Password        ║');
  console.log('║  ─────     ─────       ──────       ────────        ║');
  console.log('║  ADMIN     Sumod       9876543210   123             ║');
  console.log('║  TEACHER   Sindhu      9876598765   123             ║');
  console.log('║  STUDENT   Student 1   9876511111   123             ║');
  console.log('║  PARENT    Parent 1    9876512345   123             ║');
  console.log('║  STUDENT   Student 2   9876522222   123             ║');
  console.log('║                                                     ║');
  console.log('║  ParentLink: Parent 1 → Student 1                   ║');
  console.log('╚══════════════════════════════════════════════════════╝');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
