/**
 * Which tables the staging <-> live content sync covers, how they connect, and the rule for each.
 *
 * Staging is where admins import, extract, correct and approve questions. Approved work is promoted to the live
 * database; what changes on the live site (teachers' own questions, students' reports) is replicated back down.
 * Student data never leaves the live database.
 *
 * Tables are listed parents first: rows are written in this order and deleted in reverse.
 */

export type SyncDirection =
  /** Changes flow both ways, gated on the way up (see `gate`). */
  | 'both'
  /** The live database is authoritative: its rows are copied down; staging edits are never promoted. */
  | 'down';

export type PromotionGate =
  /** Promoted when its own status is APPROVED or ARCHIVED (an admin decision). */
  | 'status'
  /** Promoted with its question: only when that question is (or is already live and) APPROVED or ARCHIVED. */
  | 'question'
  /** New rows go up only when something promoted needs them; edits to rows already live go up. */
  | 'needed'
  /** New rows go up when their parent (named by `followsParent`) is live or being promoted. */
  | 'parent';

export interface ForeignKey {
  column: string;
  table: string;
}

export interface SyncTable {
  name: string;
  direction: SyncDirection;
  gate: PromotionGate;
  foreignKeys: ForeignKey[];
  /** A foreign key to the same table: written in parent-before-child order. */
  selfParent?: string;
  /** For gate 'parent': the foreign-key column whose parent decides. */
  followsParent?: string;
  /** For gate 'question': the column holding the question id. */
  questionColumn?: string;
  /**
   * Whether a row deleted on one side may be deleted on the other. Questions, books and their history are never
   * hard-deleted (they are archived instead), so only link and derived rows are.
   */
  deletable: boolean;
}

export const SYNC_TABLES: SyncTable[] = [
  { name: 'User', direction: 'down', gate: 'needed', foreignKeys: [], deletable: false },
  { name: 'TagTaxonomy', direction: 'both', gate: 'needed', foreignKeys: [{ column: 'parentId', table: 'TagTaxonomy' }], selfParent: 'parentId', deletable: false },
  { name: 'KnowledgeFolder', direction: 'down', gate: 'needed', foreignKeys: [{ column: 'parentId', table: 'KnowledgeFolder' }, { column: 'userId', table: 'User' }], selfParent: 'parentId', deletable: false },
  { name: 'KnowledgeDocument', direction: 'down', gate: 'needed', foreignKeys: [{ column: 'folderId', table: 'KnowledgeFolder' }], deletable: true },
  { name: 'Flashcard', direction: 'down', gate: 'needed', foreignKeys: [{ column: 'folderId', table: 'KnowledgeFolder' }], deletable: true },
  { name: 'DocumentChunk', direction: 'down', gate: 'needed', foreignKeys: [{ column: 'folderId', table: 'KnowledgeFolder' }], deletable: true },
  { name: 'Book', direction: 'both', gate: 'needed', foreignKeys: [{ column: 'createdById', table: 'User' }], deletable: false },
  { name: 'BookChapter', direction: 'both', gate: 'needed', foreignKeys: [{ column: 'bookId', table: 'Book' }], deletable: false },
  { name: 'BookExercise', direction: 'both', gate: 'needed', foreignKeys: [{ column: 'chapterId', table: 'BookChapter' }], deletable: false },
  { name: 'SourceDocument', direction: 'both', gate: 'needed', foreignKeys: [{ column: 'ingestedBy', table: 'User' }, { column: 'bookId', table: 'Book' }], deletable: false },
  { name: 'DocumentPage', direction: 'both', gate: 'parent', followsParent: 'documentId', foreignKeys: [{ column: 'documentId', table: 'SourceDocument' }], deletable: false },
  { name: 'SamplePaper', direction: 'both', gate: 'needed', foreignKeys: [{ column: 'ingestedBy', table: 'User' }], deletable: false },
  { name: 'SamplePaperPage', direction: 'both', gate: 'parent', followsParent: 'paperId', foreignKeys: [{ column: 'paperId', table: 'SamplePaper' }], deletable: false },
  {
    name: 'Question', direction: 'both', gate: 'status', deletable: false,
    foreignKeys: [
      { column: 'createdById', table: 'User' },
      { column: 'knowledgeFolderId', table: 'KnowledgeFolder' },
      { column: 'sourceDocumentId', table: 'SourceDocument' },
      { column: 'samplePaperId', table: 'SamplePaper' },
      { column: 'bookId', table: 'Book' },
      { column: 'bookChapterId', table: 'BookChapter' },
      { column: 'bookExerciseId', table: 'BookExercise' },
    ],
  },
  { name: 'Solution', direction: 'both', gate: 'question', questionColumn: 'questionId', foreignKeys: [{ column: 'questionId', table: 'Question' }], deletable: false },
  { name: 'QuestionVersion', direction: 'both', gate: 'question', questionColumn: 'questionId', foreignKeys: [{ column: 'questionId', table: 'Question' }], deletable: false },
  { name: 'QuestionImage', direction: 'both', gate: 'question', questionColumn: 'questionId', foreignKeys: [{ column: 'questionId', table: 'Question' }], deletable: true },
  { name: 'QuestionTag', direction: 'both', gate: 'question', questionColumn: 'questionId', foreignKeys: [{ column: 'questionId', table: 'Question' }, { column: 'tagId', table: 'TagTaxonomy' }], deletable: true },
  { name: 'QuestionEmbedding', direction: 'both', gate: 'question', questionColumn: 'questionId', foreignKeys: [{ column: 'questionId', table: 'Question' }], deletable: true },
  {
    // A figure cut from a page; tied to a question when it illustrates one, otherwise it goes with its page.
    name: 'PageFigure', direction: 'both', gate: 'question', questionColumn: 'questionId', deletable: true,
    foreignKeys: [{ column: 'bookId', table: 'Book' }, { column: 'documentPageId', table: 'DocumentPage' }, { column: 'questionId', table: 'Question' }],
  },
  { name: 'RevisionItem', direction: 'both', gate: 'status', foreignKeys: [{ column: 'bookId', table: 'Book' }, { column: 'chapterId', table: 'BookChapter' }], deletable: false },
];

/**
 * Admins' working records (upload sessions, ingestion runs, provider benchmarks, extraction sessions). Copied down
 * once when staging is first filled so unfinished books can be continued there, and never synced after that.
 */
export const SEED_ONLY_TABLES: Array<{ name: string; foreignKeys: ForeignKey[] }> = [
  { name: 'BookIngestionRun', foreignKeys: [{ column: 'bookId', table: 'Book' }, { column: 'userId', table: 'User' }, { column: 'sourceDocumentId', table: 'SourceDocument' }] },
  { name: 'BookUploadSession', foreignKeys: [{ column: 'bookId', table: 'Book' }, { column: 'createdById', table: 'User' }] },
  { name: 'PageExtractionBenchmark', foreignKeys: [{ column: 'ingestionRunId', table: 'BookIngestionRun' }, { column: 'documentPageId', table: 'DocumentPage' }] },
  { name: 'ExtractionSession', foreignKeys: [{ column: 'userId', table: 'User' }, { column: 'sourceDocumentId', table: 'SourceDocument' }, { column: 'solutionDocumentId', table: 'SourceDocument' }] },
  { name: 'IngestionJob', foreignKeys: [{ column: 'userId', table: 'User' }] },
];

/** Statuses that are an admin's decision, so a question or revision item carrying one may go live. */
export const PROMOTABLE_STATUSES = new Set(['APPROVED', 'ARCHIVED']);

/** Roles whose accounts are copied down so staff can sign in to staging. Students and parents never are. */
export const STAFF_ROLES = new Set(['ADMIN', 'TEACHER']);

export function tableByName(name: string): SyncTable {
  const table = SYNC_TABLES.find((t) => t.name === name);
  if (!table) throw new Error(`Unknown sync table ${name}`);
  return table;
}
