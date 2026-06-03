import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const adapter = new PrismaPg({
  host: 'aws-1-ap-south-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.nlzntnjvkbuxttmmcpyl',
  password: 'Vrishab@12345',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter });

type TagType = 'CLASS' | 'SUBJECT' | 'TOPIC' | 'SUBTOPIC' | 'EXAM_TYPE' | 'CUSTOM';
type BoardType = 'CBSE' | 'NDA' | 'CUET' | 'JEE_MAIN' | null;
type Source = 'OFFICIAL' | 'MANUAL';

interface SyllabusTopic {
  name: string;
  subtopics?: string[];
}

interface SyllabusClass {
  name: string;
  topics: (string | SyllabusTopic)[];
}

interface SyllabusData {
  board: string;
  topics?: string[] | SyllabusTopic[];
  classes?: SyllabusClass[];
  sourceUrl?: string;
  detailedSyllabus?: Record<string, string[]>; // NDA-style: topic name → subtopics
  exam?: string;
  paper?: string;
}

interface JeeTopic {
  name: string;
  subtopics: string[];
}

interface JeeData {
  board: string;
  topics: JeeTopic[];
  sourceUrl?: string;
}

async function findOrCreateTag(
  name: string,
  type: TagType,
  parentId: string | null,
  order: number,
  source: Source,
  boardType: BoardType,
  sourceUrl?: string,
  createdById?: string
): Promise<string> {
  const existing = await prisma.tagTaxonomy.findFirst({
    where: { name, type, parentId }
  });

  if (existing) {
    if (order !== existing.order) {
      await prisma.tagTaxonomy.update({
        where: { id: existing.id },
        data: { order }
      });
    }
    return existing.id;
  }

  const created = await prisma.tagTaxonomy.create({
    data: {
      name,
      type,
      parentId,
      order,
      source,
      boardType,
      sourceUrl,
      isApproved: true,
      isLocked: source === 'OFFICIAL',
      createdById,
      isActive: true,
    }
  });

  console.log(`  ✓ ${name} (${type})`);
  return created.id;
}

async function seedCBSE() {
  console.log('\n📚 Seeding CBSE Curriculum...\n');

  // Remove classes 6-9 (only Class 10-12 are needed)
  const removeClasses = ['Class 6', 'Class 7', 'Class 8', 'Class 9'];
  for (const cls of removeClasses) {
    const existing = await prisma.tagTaxonomy.findFirst({
      where: { name: cls, type: 'CLASS', parentId: null }
    });
    if (existing) {
      const subjects = await prisma.tagTaxonomy.findMany({ where: { parentId: existing.id } });
      for (const subj of subjects) {
        const topics = await prisma.tagTaxonomy.findMany({ where: { parentId: subj.id } });
        for (const topic of topics) {
          await prisma.questionTag.deleteMany({ where: { tagId: topic.id } });
          await prisma.questionTag.deleteMany({ where: { tagId: subj.id } });
          const subtopics = await prisma.tagTaxonomy.findMany({ where: { parentId: topic.id } });
          for (const st of subtopics) {
            await prisma.questionTag.deleteMany({ where: { tagId: st.id } });
          }
          await prisma.tagTaxonomy.deleteMany({ where: { parentId: topic.id } }); // subtopics
        }
        await prisma.tagTaxonomy.deleteMany({ where: { parentId: subj.id } }); // topics
      }
      await prisma.tagTaxonomy.deleteMany({ where: { parentId: existing.id } }); // subjects
      await prisma.tagTaxonomy.delete({ where: { id: existing.id } }); // class itself
      console.log(`  ✗ Removed ${cls} and its children`);
    }
  }
  
  const cbseFile = path.join(__dirname, 'syllabus', 'cbse.json');
  const data: SyllabusData = JSON.parse(fs.readFileSync(cbseFile, 'utf-8'));
  
  let classOrder = 0;
  for (const classData of data.classes || []) {
    classOrder++;
    const classId = await findOrCreateTag(
      classData.name,
      'CLASS',
      null,
      classOrder,
      'OFFICIAL',
      'CBSE',
      'https://ncert.nic.in/syllabus.htm'
    );
    
    const subjectId = await findOrCreateTag(
      'Mathematics',
      'SUBJECT',
      classId,
      1,
      'OFFICIAL',
      'CBSE'
    );
    
    let topicOrder = 0;
    for (const topic of classData.topics) {
      topicOrder++;
      const topicName = typeof topic === 'string' ? topic : topic.name;
      const topicId = await findOrCreateTag(
        topicName,
        'TOPIC',
        subjectId,
        topicOrder,
        'OFFICIAL',
        'CBSE'
      );
      
      const subtopics = typeof topic === 'string' ? undefined : topic.subtopics;
      if (subtopics && subtopics.length > 0) {
        let subtopicOrder = 0;
        for (const subtopic of subtopics) {
          subtopicOrder++;
          await findOrCreateTag(
            subtopic,
            'SUBTOPIC',
            topicId,
            subtopicOrder,
            'OFFICIAL',
            'CBSE'
          );
        }
      }
    }
  }
}

async function seedNDA() {
  console.log('\n🎯 Seeding NDA Curriculum...\n');
  
  const ndaFile = path.join(__dirname, 'syllabus', 'nda.json');
  const data: SyllabusData = JSON.parse(fs.readFileSync(ndaFile, 'utf-8'));
  
  const classId = await findOrCreateTag(
    'NDA',
    'CLASS',
    null,
    8,
    'OFFICIAL',
    'NDA',
    data.sourceUrl
  );
  
  const subjectId = await findOrCreateTag(
    'Mathematics',
    'SUBJECT',
    classId,
    1,
    'OFFICIAL',
    'NDA'
  );
  
  const topicsData: string[] = data.detailedSyllabus 
    ? Object.keys(data.detailedSyllabus) 
    : (data.topics as string[]) || [];
  
  let topicOrder = 0;
  for (const topicName of topicsData) {
    topicOrder++;
    const topicId = await findOrCreateTag(
      topicName,
      'TOPIC',
      subjectId,
      topicOrder,
      'OFFICIAL',
      'NDA'
    );
    
    if (data.detailedSyllabus && data.detailedSyllabus[topicName as keyof typeof data.detailedSyllabus]) {
      const subtopics = data.detailedSyllabus[topicName as keyof typeof data.detailedSyllabus];
      let subtopicOrder = 0;
      for (const subtopic of subtopics) {
        subtopicOrder++;
        await findOrCreateTag(
          subtopic,
          'SUBTOPIC',
          topicId,
          subtopicOrder,
          'OFFICIAL',
          'NDA'
        );
      }
    }
  }
}

async function seedCUET() {
  console.log('\n📝 Seeding CUET Curriculum...\n');
  
  const cuetFile = path.join(__dirname, 'syllabus', 'cuet.json');
  const data: SyllabusData = JSON.parse(fs.readFileSync(cuetFile, 'utf-8'));
  
  const classId = await findOrCreateTag(
    'CUET',
    'CLASS',
    null,
    9,
    'OFFICIAL',
    'CUET',
    data.sourceUrl
  );
  
  const subjectId = await findOrCreateTag(
    'Mathematics',
    'SUBJECT',
    classId,
    1,
    'OFFICIAL',
    'CUET'
  );
  
  const topics = (data.topics as SyllabusTopic[]) || [];
  let topicOrder = 0;
  for (const topicData of topics) {
    topicOrder++;
    const topicId = await findOrCreateTag(
      topicData.name,
      'TOPIC',
      subjectId,
      topicOrder,
      'OFFICIAL',
      'CUET'
    );
    
    if (topicData.subtopics && topicData.subtopics.length > 0) {
      let subtopicOrder = 0;
      for (const subtopic of topicData.subtopics) {
        subtopicOrder++;
        await findOrCreateTag(
          subtopic,
          'SUBTOPIC',
          topicId,
          subtopicOrder,
          'OFFICIAL',
          'CUET'
        );
      }
    }
  }
}

async function seedJEEMain() {
  console.log('\n🏆 Seeding JEE Main Curriculum...\n');
  
  const jeeFile = path.join(__dirname, 'syllabus', 'jee-main.json');
  const data: JeeData = JSON.parse(fs.readFileSync(jeeFile, 'utf-8'));
  
  const classId = await findOrCreateTag(
    'JEE Main',
    'CLASS',
    null,
    10,
    'OFFICIAL',
    'JEE_MAIN',
    data.sourceUrl
  );
  
  const subjectId = await findOrCreateTag(
    'Mathematics',
    'SUBJECT',
    classId,
    1,
    'OFFICIAL',
    'JEE_MAIN'
  );
  
  const jeeTopics = (data.topics as SyllabusTopic[]) || [];
  let topicOrder = 0;
  for (const topicData of jeeTopics) {
    topicOrder++;
    const topicId = await findOrCreateTag(
      topicData.name,
      'TOPIC',
      subjectId,
      topicOrder,
      'OFFICIAL',
      'JEE_MAIN'
    );
    
    if (topicData.subtopics && topicData.subtopics.length > 0) {
      let subtopicOrder = 0;
      for (const subtopic of topicData.subtopics) {
        subtopicOrder++;
        await findOrCreateTag(
          subtopic,
          'SUBTOPIC',
          topicId,
          subtopicOrder,
          'OFFICIAL',
          'JEE_MAIN'
        );
      }
    }
  }
}

async function seedCurriculum() {
  console.log('='.repeat(60));
  console.log('🎓 MATHSWIZ CURRICULUM TAXONOMY SEEDING');
  console.log('='.repeat(60));
  
  const existingCount = await prisma.tagTaxonomy.count();
  console.log(`\n📊 Current taxonomy entries: ${existingCount}`);
  
  if (existingCount > 100) {
    console.log('\n⚠️  Clearing existing taxonomy before re-seed...');
    await prisma.questionTag.deleteMany();
    const subtopics = await prisma.tagTaxonomy.findMany({ where: { type: 'SUBTOPIC' } });
    for (const st of subtopics) {
      await prisma.tagTaxonomy.delete({ where: { id: st.id } });
    }
    const topics = await prisma.tagTaxonomy.findMany({ where: { type: 'TOPIC' } });
    for (const t of topics) {
      await prisma.tagTaxonomy.delete({ where: { id: t.id } });
    }
    const subjects = await prisma.tagTaxonomy.findMany({ where: { type: 'SUBJECT' } });
    for (const s of subjects) {
      await prisma.tagTaxonomy.delete({ where: { id: s.id } });
    }
    const classes = await prisma.tagTaxonomy.findMany({ where: { type: 'CLASS' } });
    for (const c of classes) {
      await prisma.tagTaxonomy.delete({ where: { id: c.id } });
    }
    console.log('✅ Cleared existing taxonomy data.');
  }
  
  try {
    await seedCBSE();
    await seedNDA();
    await seedCUET();
    await seedJEEMain();
    
    const finalCount = await prisma.tagTaxonomy.count();
    
    console.log('\n' + '='.repeat(60));
    console.log(`✅ CURRICULUM SEEDING COMPLETE!`);
    console.log(`📊 Total taxonomy entries: ${finalCount}`);
    console.log('='.repeat(60));
    
    const classCount = await prisma.tagTaxonomy.count({ where: { type: 'CLASS' } });
    const subjectCount = await prisma.tagTaxonomy.count({ where: { type: 'SUBJECT' } });
    const topicCount = await prisma.tagTaxonomy.count({ where: { type: 'TOPIC' } });
    const subtopicCount = await prisma.tagTaxonomy.count({ where: { type: 'SUBTOPIC' } });
    
    console.log('\n📋 Breakdown:');
    console.log(`   Classes: ${classCount}`);
    console.log(`   Subjects: ${subjectCount}`);
    console.log(`   Topics: ${topicCount}`);
    console.log(`   Subtopics: ${subtopicCount}`);
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    throw error;
  }
}

seedCurriculum()
  .catch((e) => { 
    console.error('Fatal error:', e); 
    process.exit(1); 
  })
  .finally(async () => { 
    await prisma.$disconnect(); 
    process.exit(0);
  });