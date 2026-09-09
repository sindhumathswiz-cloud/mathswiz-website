import { describe, expect, it } from 'vitest';
import {
  detectManifest,
  isLikelyAnswerKeyPage,
  isLikelyDetailedSolutionsPage,
  findAnswerKeyPairs,
  parseSolutionBlocks,
  chapterForPage,
  sectionForPage,
  answerKeySectionForPage,
  solutionsSectionForPage,
  type ConfirmedChapter,
  type ManifestDetectPage,
} from './book-manifest';

const page = (pageNumber: number, rawText: string, layoutData?: unknown): ManifestDetectPage => ({ pageNumber, rawText, layoutData });

const ANSWER_KEY_TEXT = 'Answers\n1. (a) 2. (b) 3. (c) 4. (d) 5. (a) 6. (c) 7. (d) 8. (b)';
const SOLUTIONS_TEXT = [
  'Detailed Solutions',
  '1. We first resolve the vector into its rectangular components and then compute its magnitude, which works out to exactly five units.',
  '2. Taking the dot product of the two given vectors and simplifying the resulting expression, the required scalar is seven.',
].join('\n');

describe('page-text signals (shared with the match-* routes)', () => {
  it('recognises an answer-key page by heading plus pairs', () => {
    expect(findAnswerKeyPairs(ANSWER_KEY_TEXT)).toHaveLength(8);
    expect(isLikelyAnswerKeyPage(ANSWER_KEY_TEXT)).toBe(true);
    expect(isLikelyAnswerKeyPage('An ordinary paragraph with no numbered letters at all.')).toBe(false);
  });

  it('recognises a detailed-solutions page by first-line heading plus prose blocks', () => {
    expect(parseSolutionBlocks(SOLUTIONS_TEXT)).toHaveLength(2);
    expect(isLikelyDetailedSolutionsPage(SOLUTIONS_TEXT)).toBe(true);
    // The word "solution" inside a question stem must not trigger it.
    expect(isLikelyDetailedSolutionsPage('3. Show that the general solution of the differential equation is ...')).toBe(false);
  });
});

describe('detectManifest', () => {
  it('groups consecutive pages that share a running header into one chapter, skipping front matter', () => {
    const pages: ManifestDetectPage[] = [
      page(1, 'Contents'),
      page(2, 'Syllabus'),
      page(3, 'PROBABILITY\nSome text about conditional probability.'),
      page(4, 'PROBABILITY\nBayes theorem and its applications.'),
      page(5, 'PROBABILITY\nRandom variables and distributions.'),
      page(6, 'PROBABILITY\nMore worked material.'),
      page(7, 'Index'),
    ];
    const { chapters } = detectManifest(pages, 'Class 12');
    expect(chapters).toHaveLength(1);
    expect(chapters[0].name).toBe('Probability');
    expect(chapters[0].startPage).toBe(3);
    expect(chapters[0].endPage).toBe(6);
  });

  it('splits a chapter into sections at question-type headings', () => {
    const pages: ManifestDetectPage[] = [
      page(10, 'VECTOR ALGEBRA\nMULTIPLE CHOICE QUESTIONS\n1. The magnitude of ...'),
      page(11, 'VECTOR ALGEBRA\n2. Which of the following ...'),
      page(12, 'VECTOR ALGEBRA\nSHORT ANSWER TYPE QUESTIONS\n1. Find the unit vector ...'),
      page(13, 'VECTOR ALGEBRA\n2. Prove that ...'),
    ];
    const { chapters } = detectManifest(pages, 'Class 12');
    expect(chapters[0].sections.map((s) => s.sectionType)).toEqual(['MCQ', 'SHORT_ANSWER']);
    expect(chapters[0].sections[0].startPage).toBe(10);
    expect(chapters[0].sections[1].startPage).toBe(12);
  });

  it('attaches a separate answer-key block to the section it follows and extends the chapter over it', () => {
    const pages: ManifestDetectPage[] = [
      page(20, 'VECTOR ALGEBRA\nMULTIPLE CHOICE QUESTIONS\n1. The value of ...'),
      page(21, 'VECTOR ALGEBRA\n2. If the vectors ...'),
      page(22, ANSWER_KEY_TEXT),
    ];
    const { chapters } = detectManifest(pages, 'Class 12');
    expect(chapters[0].endPage).toBe(22);
    const section = chapters[0].sections[0];
    expect(section.sectionType).toBe('MCQ');
    expect(section.answerKeyStartPage).toBe(22);
    expect(section.answerKeyEndPage).toBe(22);
    expect(section.noAnswers).toBe(false);
  });

  it('attaches a separate detailed-solutions block', () => {
    const pages: ManifestDetectPage[] = [
      page(30, 'VECTOR ALGEBRA\nLONG ANSWER TYPE QUESTIONS\n1. Derive the expression ...'),
      page(31, 'VECTOR ALGEBRA\n2. Establish the identity ...'),
      page(32, SOLUTIONS_TEXT),
    ];
    const { chapters } = detectManifest(pages, 'Class 12');
    const section = chapters[0].sections[0];
    expect(section.solutionsStartPage).toBe(32);
    expect(section.solutionsEndPage).toBe(32);
  });

  it('marks a Solved Examples section as inline-answers', () => {
    const pages: ManifestDetectPage[] = [
      page(40, 'MATRICES\nSOLVED EXAMPLES\nExample 1. Sol. We compute ...'),
      page(41, 'MATRICES\nExample 2. Sol. Expanding along the first row ...'),
    ];
    const { chapters } = detectManifest(pages, 'Class 12');
    expect(chapters[0].sections[0].inlineAnswers).toBe(true);
    expect(chapters[0].sections[0].noAnswers).toBe(false);
  });

  it('marks a section with no answers anywhere as a practice exercise', () => {
    const pages: ManifestDetectPage[] = [
      page(50, 'DETERMINANTS\nEXERCISE 4.1\n1. Evaluate the determinant.'),
      page(51, 'DETERMINANTS\n2. Solve the system by Cramer’s rule.'),
    ];
    const { chapters } = detectManifest(pages, 'Class 12');
    const section = chapters[0].sections[0];
    expect(section.sectionType).toBe('EXERCISE');
    expect(section.noAnswers).toBe(true);
    expect(section.answerKeyStartPage).toBeNull();
    expect(section.solutionsStartPage).toBeNull();
  });
});

describe('confirmed-manifest consumer helpers', () => {
  const chapters: ConfirmedChapter[] = [
    {
      id: 'ch1', name: 'Vector Algebra', topic: 'Vector Algebra',
      startPage: 100, endPage: 130, manifestConfirmedAt: new Date(),
      exercises: [
        { id: 's1', sectionType: 'MCQ', startPage: 100, endPage: 108, inlineAnswers: false, noAnswers: false, answerKeyStartPage: 120, answerKeyEndPage: 121, solutionsStartPage: null, solutionsEndPage: null },
        { id: 's2', sectionType: 'LONG_ANSWER', startPage: 109, endPage: 115, inlineAnswers: false, noAnswers: false, answerKeyStartPage: null, answerKeyEndPage: null, solutionsStartPage: 125, solutionsEndPage: 128 },
        { id: 's3', sectionType: 'EXERCISE', startPage: 116, endPage: 119, inlineAnswers: false, noAnswers: true, answerKeyStartPage: null, answerKeyEndPage: null, solutionsStartPage: null, solutionsEndPage: null },
      ],
    },
    {
      id: 'ch2', name: 'Probability', topic: 'Probability',
      startPage: 131, endPage: 160, manifestConfirmedAt: null, exercises: [],
    },
  ];

  it('chapterForPage only resolves inside a confirmed chapter', () => {
    expect(chapterForPage(chapters, 105)?.id).toBe('ch1');
    expect(chapterForPage(chapters, 140)).toBeNull(); // ch2 not confirmed
    expect(chapterForPage(chapters, 999)).toBeNull();
  });

  it('sectionForPage resolves the question range', () => {
    expect(sectionForPage(chapters, 104)?.section.id).toBe('s1');
    expect(sectionForPage(chapters, 112)?.section.id).toBe('s2');
    expect(sectionForPage(chapters, 121)).toBeNull(); // 121 is the key range, not a question range
  });

  it('answerKeySectionForPage / solutionsSectionForPage resolve the sub-ranges and skip noAnswers', () => {
    expect(answerKeySectionForPage(chapters, 120)?.section.id).toBe('s1');
    expect(solutionsSectionForPage(chapters, 126)?.section.id).toBe('s2');
    expect(answerKeySectionForPage(chapters, 117)).toBeNull(); // s3 is a practice exercise
  });
});
