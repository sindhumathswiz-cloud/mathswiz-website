import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Direct connection parameters (avoids URL parsing issues with @ in password)
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

interface TaxonomyEntry {
  name: string;
  type: TagType;
  children?: TaxonomyEntry[];
}

async function createTaxonomyEntry(entry: TaxonomyEntry, parentId: string | null = null): Promise<string> {
  const existing = await prisma.tagTaxonomy.findFirst({
    where: { name: entry.name, type: entry.type as any, parentId }
  });

  if (existing) {
    if (entry.children) {
      for (const child of entry.children) {
        await createTaxonomyEntry(child, existing.id);
      }
    }
    return existing.id;
  }

  const created = await prisma.tagTaxonomy.create({
    data: { name: entry.name, type: entry.type as any, parentId, isActive: true }
  });

  console.log(`  Created: ${entry.name} (${entry.type})`);

  if (entry.children) {
    for (const child of entry.children) {
      await createTaxonomyEntry(child, created.id);
    }
  }

  return created.id;
}

async function seedTaxonomy() {
  console.log('🌳 Seeding Tag Taxonomy...\n');

  const count = await prisma.tagTaxonomy.count();
  if (count > 100) {
    console.log(`⚠️  Taxonomy already has ${count} entries. Skipping seed.`);
    return;
  }

  const taxonomy: TaxonomyEntry[] = [
    { name: 'Class 6', type: 'CLASS', children: [{ name: 'Mathematics', type: 'SUBJECT', children: [
      { name: 'Knowing Our Numbers', type: 'TOPIC' }, { name: 'Whole Numbers', type: 'TOPIC' },
      { name: 'Playing with Numbers', type: 'TOPIC' }, { name: 'Basic Geometrical Ideas', type: 'TOPIC' },
      { name: 'Integers', type: 'TOPIC' }, { name: 'Fractions', type: 'TOPIC' },
      { name: 'Decimals', type: 'TOPIC' }, { name: 'Data Handling', type: 'TOPIC' },
      { name: 'Mensuration', type: 'TOPIC' }, { name: 'Algebra', type: 'TOPIC' },
      { name: 'Ratio and Proportion', type: 'TOPIC' },
    ]}]},
    { name: 'Class 7', type: 'CLASS', children: [{ name: 'Mathematics', type: 'SUBJECT', children: [
      { name: 'Integers', type: 'TOPIC' }, { name: 'Fractions and Decimals', type: 'TOPIC' },
      { name: 'Data Handling', type: 'TOPIC' }, { name: 'Simple Equations', type: 'TOPIC' },
      { name: 'Lines and Angles', type: 'TOPIC' }, { name: 'The Triangle and its Properties', type: 'TOPIC' },
      { name: 'Comparing Quantities', type: 'TOPIC' }, { name: 'Rational Numbers', type: 'TOPIC' },
      { name: 'Perimeter and Area', type: 'TOPIC' }, { name: 'Algebraic Expressions', type: 'TOPIC' },
    ]}]},
    { name: 'Class 8', type: 'CLASS', children: [{ name: 'Mathematics', type: 'SUBJECT', children: [
      { name: 'Rational Numbers', type: 'TOPIC' }, { name: 'Linear Equations in One Variable', type: 'TOPIC' },
      { name: 'Understanding Quadrilaterals', type: 'TOPIC' }, { name: 'Data Handling', type: 'TOPIC' },
      { name: 'Squares and Square Roots', type: 'TOPIC' }, { name: 'Comparing Quantities', type: 'TOPIC' },
      { name: 'Algebraic Expressions and Identities', type: 'TOPIC' }, { name: 'Mensuration', type: 'TOPIC' },
      { name: 'Exponents and Powers', type: 'TOPIC' }, { name: 'Factorisation', type: 'TOPIC' },
    ]}]},
    { name: 'Class 9', type: 'CLASS', children: [{ name: 'Mathematics', type: 'SUBJECT', children: [
      { name: 'Number Systems', type: 'TOPIC' }, { name: 'Polynomials', type: 'TOPIC' },
      { name: 'Coordinate Geometry', type: 'TOPIC' }, { name: 'Linear Equations in Two Variables', type: 'TOPIC' },
      { name: 'Lines and Angles', type: 'TOPIC' }, { name: 'Triangles', type: 'TOPIC' },
      { name: 'Quadrilaterals', type: 'TOPIC' }, { name: 'Circles', type: 'TOPIC' },
      { name: 'Surface Areas and Volumes', type: 'TOPIC' }, { name: 'Statistics', type: 'TOPIC' },
      { name: 'Probability', type: 'TOPIC' },
    ]}]},
    { name: 'Class 10', type: 'CLASS', children: [{ name: 'Mathematics', type: 'SUBJECT', children: [
      { name: 'Real Numbers', type: 'TOPIC', children: [
        { name: "Euclid's Division Lemma", type: 'SUBTOPIC' }, { name: 'Fundamental Theorem of Arithmetic', type: 'SUBTOPIC' },
      ]},
      { name: 'Polynomials', type: 'TOPIC', children: [
        { name: 'Zeros of Polynomials', type: 'SUBTOPIC' }, { name: 'Division Algorithm', type: 'SUBTOPIC' },
      ]},
      { name: 'Pair of Linear Equations in Two Variables', type: 'TOPIC', children: [
        { name: 'Graphical Method', type: 'SUBTOPIC' }, { name: 'Substitution Method', type: 'SUBTOPIC' },
        { name: 'Elimination Method', type: 'SUBTOPIC' },
      ]},
      { name: 'Quadratic Equations', type: 'TOPIC', children: [
        { name: 'Factorization Method', type: 'SUBTOPIC' }, { name: 'Completing the Square', type: 'SUBTOPIC' },
        { name: 'Quadratic Formula', type: 'SUBTOPIC' },
      ]},
      { name: 'Arithmetic Progressions', type: 'TOPIC', children: [
        { name: 'nth Term of AP', type: 'SUBTOPIC' }, { name: 'Sum of n Terms', type: 'SUBTOPIC' },
      ]},
      { name: 'Triangles', type: 'TOPIC', children: [
        { name: 'Similar Triangles', type: 'SUBTOPIC' }, { name: 'Pythagoras Theorem', type: 'SUBTOPIC' },
      ]},
      { name: 'Coordinate Geometry', type: 'TOPIC', children: [
        { name: 'Distance Formula', type: 'SUBTOPIC' }, { name: 'Section Formula', type: 'SUBTOPIC' },
      ]},
      { name: 'Introduction to Trigonometry', type: 'TOPIC', children: [
        { name: 'Trigonometric Ratios', type: 'SUBTOPIC' }, { name: 'Trigonometric Identities', type: 'SUBTOPIC' },
      ]},
      { name: 'Applications of Trigonometry', type: 'TOPIC', children: [
        { name: 'Heights and Distances', type: 'SUBTOPIC' },
      ]},
      { name: 'Circles', type: 'TOPIC', children: [
        { name: 'Tangent to a Circle', type: 'SUBTOPIC' },
      ]},
      { name: 'Statistics', type: 'TOPIC' },
      { name: 'Probability', type: 'TOPIC', children: [
        { name: 'Classical Probability', type: 'SUBTOPIC' },
      ]},
    ]}]},
    { name: 'Class 11', type: 'CLASS', children: [{ name: 'Mathematics', type: 'SUBJECT', children: [
      { name: 'Sets', type: 'TOPIC' }, { name: 'Relations and Functions', type: 'TOPIC' },
      { name: 'Trigonometric Functions', type: 'TOPIC' }, { name: 'Complex Numbers and Quadratic Equations', type: 'TOPIC' },
      { name: 'Linear Inequalities', type: 'TOPIC' }, { name: 'Permutations and Combinations', type: 'TOPIC' },
      { name: 'Binomial Theorem', type: 'TOPIC' }, { name: 'Sequences and Series', type: 'TOPIC' },
      { name: 'Straight Lines', type: 'TOPIC' },
      { name: 'Conic Sections', type: 'TOPIC', children: [
        { name: 'Circle', type: 'SUBTOPIC' }, { name: 'Parabola', type: 'SUBTOPIC' },
        { name: 'Ellipse', type: 'SUBTOPIC' }, { name: 'Hyperbola', type: 'SUBTOPIC' },
      ]},
      { name: 'Limits and Derivatives', type: 'TOPIC' },
      { name: 'Mathematical Reasoning', type: 'TOPIC' }, { name: 'Statistics', type: 'TOPIC' },
      { name: 'Probability', type: 'TOPIC' },
    ]}]},
    { name: 'Class 12', type: 'CLASS', children: [{ name: 'Mathematics', type: 'SUBJECT', children: [
      { name: 'Relations and Functions', type: 'TOPIC' }, { name: 'Inverse Trigonometric Functions', type: 'TOPIC' },
      { name: 'Matrices', type: 'TOPIC' }, { name: 'Determinants', type: 'TOPIC' },
      { name: 'Continuity and Differentiability', type: 'TOPIC' }, { name: 'Applications of Derivatives', type: 'TOPIC' },
      { name: 'Integrals', type: 'TOPIC' }, { name: 'Applications of Integrals', type: 'TOPIC' },
      { name: 'Differential Equations', type: 'TOPIC' }, { name: 'Vector Algebra', type: 'TOPIC' },
      { name: 'Three Dimensional Geometry', type: 'TOPIC' }, { name: 'Linear Programming', type: 'TOPIC' },
      { name: 'Probability', type: 'TOPIC' },
    ]}]},
    { name: 'NDA', type: 'CLASS', children: [{ name: 'Mathematics', type: 'SUBJECT', children: [
      { name: 'Algebra', type: 'TOPIC' }, { name: 'Trigonometry', type: 'TOPIC' },
      { name: 'Analytical Geometry', type: 'TOPIC' }, { name: 'Differential Calculus', type: 'TOPIC' },
      { name: 'Integral Calculus', type: 'TOPIC' }, { name: 'Differential Equations', type: 'TOPIC' },
      { name: 'Matrices and Determinants', type: 'TOPIC' }, { name: 'Probability and Statistics', type: 'TOPIC' },
    ]}]},
    { name: 'CUET', type: 'CLASS', children: [{ name: 'Mathematics', type: 'SUBJECT', children: [
      { name: 'Relations and Functions', type: 'TOPIC' }, { name: 'Matrices', type: 'TOPIC' },
      { name: 'Determinants', type: 'TOPIC' }, { name: 'Continuity and Differentiability', type: 'TOPIC' },
      { name: 'Applications of Derivatives', type: 'TOPIC' }, { name: 'Integrals', type: 'TOPIC' },
      { name: 'Differential Equations', type: 'TOPIC' }, { name: 'Vector Algebra', type: 'TOPIC' },
      { name: 'Three Dimensional Geometry', type: 'TOPIC' }, { name: 'Probability', type: 'TOPIC' },
    ]}]},
    { name: 'JEE Main', type: 'CLASS', children: [{ name: 'Mathematics', type: 'SUBJECT', children: [
      { name: 'Sets, Relations and Functions', type: 'TOPIC' }, { name: 'Complex Numbers', type: 'TOPIC' },
      { name: 'Matrices and Determinants', type: 'TOPIC' }, { name: 'Sequences and Series', type: 'TOPIC' },
      { name: 'Limits, Continuity and Differentiability', type: 'TOPIC' }, { name: 'Integral Calculus', type: 'TOPIC' },
      { name: 'Differential Equations', type: 'TOPIC' }, { name: 'Coordinate Geometry', type: 'TOPIC' },
      { name: 'Three Dimensional Geometry', type: 'TOPIC' }, { name: 'Vector Algebra', type: 'TOPIC' },
      { name: 'Probability', type: 'TOPIC' }, { name: 'Trigonometry', type: 'TOPIC' },
    ]}]},
    { name: 'JEE Advanced', type: 'CLASS', children: [{ name: 'Mathematics', type: 'SUBJECT', children: [
      { name: 'Algebra', type: 'TOPIC' }, { name: 'Trigonometry', type: 'TOPIC' },
      { name: 'Analytical Geometry', type: 'TOPIC' }, { name: 'Differential Calculus', type: 'TOPIC' },
      { name: 'Integral Calculus', type: 'TOPIC' }, { name: 'Vectors', type: 'TOPIC' },
      { name: 'Probability', type: 'TOPIC' },
    ]}]},
    { name: 'CBSE Board', type: 'EXAM_TYPE' },
    { name: 'ICSE Board', type: 'EXAM_TYPE' },
    { name: 'State Board', type: 'EXAM_TYPE' },
    { name: 'NDA', type: 'EXAM_TYPE' },
    { name: 'CUET', type: 'EXAM_TYPE' },
    { name: 'JEE Main', type: 'EXAM_TYPE' },
    { name: 'JEE Advanced', type: 'EXAM_TYPE' },
  ];

  for (const entry of taxonomy) {
    await createTaxonomyEntry(entry);
  }

  const finalCount = await prisma.tagTaxonomy.count();
  console.log(`\n✅ Taxonomy seed complete! Total entries: ${finalCount}`);
}

seedTaxonomy()
  .catch((e) => { console.error('❌ Error seeding taxonomy:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
