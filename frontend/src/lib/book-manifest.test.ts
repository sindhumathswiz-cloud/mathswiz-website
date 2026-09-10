import { describe, expect, it } from 'vitest';
import {
  detectManifest,
  parseTableOfContents,
  estimatePageOffset,
  isLikelyAnswerKeyPage,
  isLikelyDetailedSolutionsPage,
  findAnswerKeyPairs,
  parseSolutionBlocks,
  chapterForPage,
  sectionForPage,
  answerKeySectionForPage,
  solutionsSectionForPage,
  type ConfirmedChapter,
  type ConfirmedSection,
  type ManifestDetectPage,
} from './book-manifest';

const page = (pageNumber: number, rawText: string, layoutData?: unknown): ManifestDetectPage => ({ pageNumber, rawText, layoutData });

const ANSWER_KEY_TEXT = 'Answers\n1. (a) 2. (b) 3. (c) 4. (d) 5. (a) 6. (c) 7. (d) 8. (b)';
const SOLUTIONS_TEXT = [
  'Detailed Solutions',
  '1. We first resolve the vector into its rectangular components and then compute its magnitude, which works out to exactly five units.',
  '2. Taking the dot product of the two given vectors and simplifying the resulting expression, the required scalar is seven.',
].join('\n');

// A realistic Mathpix-rendered contents page (markdown table).
const TOC_TEXT = [
  'Contents',
  '\\begin{table}',
  '\\begin{tabular}[t]{|l|l|}',
  '\\hline 1. Relations and Functions & 9 \\\\',
  '\\hline 2. Inverse Trigonometric Functions & 41 \\\\',
  '\\hline 3. Algebra of Matrices & 63 \\\\',
  '\\hline 4. Determinants & 95 \\\\',
  '\\hline 5. Continuity and Differentiability & 133 \\\\',
  '\\hline \\multicolumn{2}{|c|}{PART-B} \\\\',
  '\\hline CBSE Sample Question Paper 2021-22 Term-1 (Solved) & 477 \\\\',
  '\\hline',
  '\\end{tabular}',
].join('\n');

describe('page-text signals', () => {
  it('recognises an answer-key page and a detailed-solutions page', () => {
    expect(findAnswerKeyPairs(ANSWER_KEY_TEXT)).toHaveLength(8);
    expect(isLikelyAnswerKeyPage(ANSWER_KEY_TEXT)).toBe(true);
    expect(parseSolutionBlocks(SOLUTIONS_TEXT)).toHaveLength(2);
    expect(isLikelyDetailedSolutionsPage(SOLUTIONS_TEXT)).toBe(true);
    expect(isLikelyDetailedSolutionsPage('3. Show that the general solution of the equation ...')).toBe(false);
  });
});

describe('parseTableOfContents', () => {
  it('reads the chapter list and the PART-B page from the markdown table', () => {
    const toc = parseTableOfContents([page(1, 'cover'), page(2, 'blank'), page(3, TOC_TEXT)]);
    expect(toc.entries.map((e) => e.name)).toEqual([
      'Relations and Functions', 'Inverse Trigonometric Functions', 'Algebra of Matrices', 'Determinants', 'Continuity and Differentiability',
    ]);
    expect(toc.entries[0].printedPage).toBe(9);
    expect(toc.entries[4].printedPage).toBe(133);
    expect(toc.partBPrintedPage).toBe(477);
  });

  it('returns nothing when no contents page exists', () => {
    expect(parseTableOfContents([page(1, 'just a normal page 1. some question')]).entries).toHaveLength(0);
  });
});

describe('estimatePageOffset', () => {
  it('finds the modal book -> PDF offset from chapter openers', () => {
    const entries = [
      { number: '1', name: 'Relations and Functions', printedPage: 9 },
      { number: '2', name: 'Determinants', printedPage: 95 },
    ];
    const pages = [
      page(14, 'Relations and Functions 1 basic pts\n1. A relation R ...'),   // 9 + 5
      page(100, 'Determinants 4 basic pts\n1. Evaluate ...'),                   // 95 + 5
    ];
    expect(estimatePageOffset(pages, entries, 'Class 12')).toBe(5);
  });
});

describe('detectManifest (TOC-driven)', () => {
  const build = (): ManifestDetectPage[] => {
    const pages: ManifestDetectPage[] = [page(3, TOC_TEXT)];
    // Chapter 1 opener at printed 9 -> PDF 14 (offset +5); chapter 2 at printed 41 -> PDF 46.
    pages.push(page(14, 'Relations and Functions 1 basic pts\n1. Let R be a relation ...'));
    pages.push(page(20, 'RELATIONS AND FUNCTIONS\nMULTIPLE CHOICE QUESTIONS\n1. The relation ...'));
    pages.push(page(30, 'RELATIONS AND FUNCTIONS\n2. Which of the following ...'));
    pages.push(page(38, ANSWER_KEY_TEXT));                                     // MCQ answer key
    pages.push(page(46, 'Inverse Trigonometric Functions 2 basic pts\n1. Principal value ...'));
    pages.push(page(50, 'INVERSE TRIGONOMETRIC FUNCTIONS\nSHORT ANSWER TYPE QUESTIONS\n1. Find the value ...'));
    return pages;
  };

  it('emits exactly the TOC chapters with printed + PDF ranges, and never a chapter from a section heading', () => {
    const { chapters, pageOffset, tocFound } = detectManifest(build(), 'Class 12');
    expect(tocFound).toBe(true);
    expect(pageOffset).toBe(5);
    expect(chapters.map((c) => c.name)).toEqual([
      'Relations and Functions', 'Inverse Trigonometric Functions', 'Matrices', 'Determinants', 'Continuity and Differentiability',
    ]);
    const rf = chapters[0];
    expect(rf.printedStartPage).toBe(9);
    expect(rf.printedEndPage).toBe(40);
    expect(rf.startPage).toBe(14);   // 9 + 5
    expect(rf.endPage).toBe(45);     // 40 + 5
    // "MULTIPLE CHOICE QUESTIONS" is a section of chapter 1, not its own chapter.
    expect(rf.sections.some((s) => s.sectionType === 'MCQ')).toBe(true);
  });

  it('attaches the answer-key block to the MCQ section within the chapter', () => {
    const { chapters } = detectManifest(build(), 'Class 12');
    const mcq = chapters[0].sections.find((s) => s.sectionType === 'MCQ');
    expect(mcq?.answerKeyStartPage).toBe(38);
    expect(mcq?.noAnswers).toBe(false);
  });

  it('classifies a THEORY heading as a non-question section', () => {
    const pages = [
      page(3, TOC_TEXT),
      page(14, 'Relations and Functions 1 basic pts\nLIST OF IMPORTANT FORMULAE\n(i) ...'),
      page(15, 'RELATIONS AND FUNCTIONS\n1. Let R ...'),
      page(46, 'Inverse Trigonometric Functions 2 basic pts\n1. ...'),
    ];
    const { chapters } = detectManifest(pages, 'Class 12');
    expect(chapters[0].sections[0].sectionType).toBe('THEORY');
    expect(chapters[0].sections[0].noAnswers).toBe(false);
    expect(chapters[0].sections[0].inlineAnswers).toBe(false);
  });

  it('infers HINTS coverage from a "Hints" solutions heading', () => {
    const pages = [
      page(3, TOC_TEXT),
      page(14, 'Relations and Functions 1 basic pts\nLONG ANSWER TYPE QUESTIONS\n1. Prove ...'),
      page(16, 'RELATIONS AND FUNCTIONS\n2. Show ...'),
      page(20, 'Hints to Selected Questions\n1. Use the definition of an equivalence relation and check all three properties carefully before concluding.\n2. Start from the given functional equation and substitute suitable values.'),
      page(46, 'Inverse Trigonometric Functions 2 basic pts\n1. ...'),
    ];
    const { chapters } = detectManifest(pages, 'Class 12');
    const la = chapters[0].sections.find((s) => s.sectionType === 'LONG_ANSWER');
    expect(la?.solutionsStartPage).toBe(20);
    expect(la?.solutionCoverage).toBe('HINTS');
  });

  it('falls back to running-header grouping when there is no TOC', () => {
    const pages = [
      page(10, 'VECTOR ALGEBRA\nMULTIPLE CHOICE QUESTIONS\n1. ...'),
      page(11, 'VECTOR ALGEBRA\n2. ...'),
      page(12, 'VECTOR ALGEBRA\n3. ...'),
    ];
    const { chapters, tocFound } = detectManifest(pages, 'Class 12');
    expect(tocFound).toBe(false);
    expect(chapters[0].name).toBe('Vector Algebra');
  });
});

describe('confirmed-manifest consumer helpers', () => {
  const section = (over: Partial<ConfirmedSection>): ConfirmedSection => ({
    id: 's', sectionType: 'MCQ', startPage: null, endPage: null,
    inlineAnswers: false, noAnswers: false,
    answerKeyStartPage: null, answerKeyEndPage: null, answerKeyCoverage: null,
    solutionsStartPage: null, solutionsEndPage: null, solutionCoverage: null,
    ...over,
  });
  const chapters: ConfirmedChapter[] = [
    {
      id: 'ch1', name: 'Vector Algebra', topic: 'Vector Algebra',
      startPage: 100, endPage: 130, manifestConfirmedAt: new Date(),
      exercises: [
        section({ id: 's1', sectionType: 'MCQ', startPage: 100, endPage: 108, answerKeyStartPage: 120, answerKeyEndPage: 121, answerKeyCoverage: 'ALL' }),
        section({ id: 's2', sectionType: 'LONG_ANSWER', startPage: 109, endPage: 115, solutionsStartPage: 125, solutionsEndPage: 128, solutionCoverage: 'HINTS' }),
        section({ id: 's3', sectionType: 'EXERCISE', startPage: 116, endPage: 119, noAnswers: true }),
        section({ id: 's4', sectionType: 'THEORY', startPage: 98, endPage: 99 }),
      ],
    },
    { id: 'ch2', name: 'Probability', topic: 'Probability', startPage: 131, endPage: 160, manifestConfirmedAt: null, exercises: [] },
  ];

  it('chapterForPage / sectionForPage respect confirmation and skip THEORY', () => {
    expect(chapterForPage(chapters, 105)?.id).toBe('ch1');
    expect(chapterForPage(chapters, 140)).toBeNull();
    expect(sectionForPage(chapters, 104)?.section.id).toBe('s1');
    expect(sectionForPage(chapters, 98)).toBeNull(); // THEORY is not a question region
  });

  it('answerKeySectionForPage / solutionsSectionForPage resolve sub-ranges and skip noAnswers', () => {
    expect(answerKeySectionForPage(chapters, 120)?.section.id).toBe('s1');
    expect(solutionsSectionForPage(chapters, 126)?.section.solutionCoverage).toBe('HINTS');
    expect(answerKeySectionForPage(chapters, 117)).toBeNull();
  });
});
