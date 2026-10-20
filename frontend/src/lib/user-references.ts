/**
 * Everything in the database that points at a user, so an admin's "delete user" can say what is in the way.
 *
 * A user can only be deleted when none of these exist. Some would make the delete fail outright (questions, tests,
 * books and batches they own, their test attempts); the rest would be deleted along with them and lose a student's
 * or teacher's history for good. Either way the right action is to BLOCK the account instead: it stops them signing
 * in and keeps everything. Deleting is for accounts that never did anything (a mistaken or duplicate sign-up).
 *
 * user-references.test.ts checks this list against prisma/schema.prisma, so a new table that points at User has to
 * be added here (or to IGNORED_USER_REFERENCES) before the tests pass.
 */

export interface UserReference {
  /** Prisma model name. */
  model: string;
  /** The column holding the user's id. */
  field: string;
  /** What a count of these means, in a sentence like "3 test attempts". */
  label: string;
  /** The same for exactly one: "1 test attempt". */
  one: string;
}

export const USER_REFERENCES: UserReference[] = [
  // Content they made: the delete would fail, and the content belongs to the bank, not to them.
  { model: 'Question', field: 'createdById', label: 'questions authored', one: 'question authored' },
  { model: 'Test', field: 'createdById', label: 'tests created', one: 'test created' },
  { model: 'Book', field: 'createdById', label: 'books added', one: 'book added' },
  { model: 'SourceDocument', field: 'ingestedBy', label: 'source documents imported', one: 'source document imported' },
  { model: 'SamplePaper', field: 'ingestedBy', label: 'sample papers imported', one: 'sample paper imported' },
  { model: 'Course', field: 'createdById', label: 'courses created', one: 'course created' },
  { model: 'Material', field: 'createdById', label: 'study materials uploaded', one: 'study material uploaded' },
  { model: 'KnowledgeFolder', field: 'userId', label: 'knowledge-base folders', one: 'knowledge-base folder' },
  { model: 'BookUploadSession', field: 'createdById', label: 'book uploads', one: 'book upload' },
  { model: 'BookIngestionRun', field: 'userId', label: 'book extraction runs', one: 'book extraction run' },
  { model: 'ExtractionSession', field: 'userId', label: 'extraction sessions', one: 'extraction session' },
  { model: 'IngestionJob', field: 'userId', label: 'ingestion jobs', one: 'ingestion job' },
  // Teaching.
  { model: 'Batch', field: 'teacherId', label: 'batches taught', one: 'batch taught' },
  { model: 'ClassChallenge', field: 'createdById', label: 'class challenges set', one: 'class challenge set' },
  { model: 'Notice', field: 'teacherId', label: 'notices posted', one: 'notice posted' },
  { model: 'FeeStructure', field: 'teacherId', label: 'fee structures', one: 'fee structure' },
  { model: 'Intervention', field: 'teacherId', label: 'interventions assigned', one: 'intervention assigned' },
  { model: 'TeacherQuery', field: 'teacherId', label: 'student queries received', one: 'student query received' },
  // Learning history.
  { model: 'BatchEnrollment', field: 'studentId', label: 'batch enrolments', one: 'batch enrolment' },
  { model: 'TestAttempt', field: 'userId', label: 'test attempts', one: 'test attempt' },
  { model: 'TestAssignment', field: 'studentId', label: 'tests assigned to them', one: 'test assigned to them' },
  { model: 'CourseEnrollment', field: 'studentId', label: 'course enrolments', one: 'course enrolment' },
  { model: 'AttendanceRecord', field: 'studentId', label: 'attendance records', one: 'attendance record' },
  { model: 'StudentProgress', field: 'userId', label: 'topic progress records', one: 'topic progress record' },
  { model: 'MasteryEvent', field: 'userId', label: 'practice answers', one: 'practice answer' },
  { model: 'MistakeNotebookEntry', field: 'userId', label: 'mistake notebook entries', one: 'mistake notebook entry' },
  { model: 'SpacedRepetitionCard', field: 'userId', label: 'review cards', one: 'review card' },
  { model: 'StudentFlashcard', field: 'userId', label: 'flashcards', one: 'flashcard' },
  { model: 'BookmarkList', field: 'userId', label: 'bookmark lists', one: 'bookmark list' },
  { model: 'LearningPathProgress', field: 'userId', label: 'learning-path progress records', one: 'learning-path progress record' },
  { model: 'StudentGoal', field: 'userId', label: 'goals', one: 'goal' },
  { model: 'Intervention', field: 'studentId', label: 'interventions received', one: 'intervention received' },
  { model: 'TeacherQuery', field: 'studentId', label: 'questions asked to teachers', one: 'question asked to teachers' },
  { model: 'QuestionFlag', field: 'flaggedById', label: 'question reports', one: 'question report' },
  { model: 'UserBadge', field: 'userId', label: 'badges earned', one: 'badge earned' },
  { model: 'PointsTransaction', field: 'userId', label: 'points records', one: 'points record' },
  { model: 'PeerChallenge', field: 'challengerId', label: 'peer challenges sent', one: 'peer challenge sent' },
  { model: 'PeerChallenge', field: 'opponentId', label: 'peer challenges received', one: 'peer challenge received' },
  // Conversations and family links.
  { model: 'QueryReply', field: 'senderId', label: 'query replies', one: 'query reply' },
  { model: 'Message', field: 'senderId', label: 'batch messages', one: 'batch message' },
  { model: 'ParentLink', field: 'parentId', label: 'children linked', one: 'child linked' },
  { model: 'ParentLink', field: 'studentId', label: 'parents linked', one: 'parent linked' },
];

/**
 * References that do not stand in the way: sign-in records and notifications go with the account, and the rest
 * keep their row with the user field cleared (an audit entry, a lead, a review, a resolved report).
 */
export const IGNORED_USER_REFERENCES: Array<{ model: string; field: string }> = [
  { model: 'Account', field: 'userId' },
  { model: 'Session', field: 'userId' },
  { model: 'Notification', field: 'userId' },
  { model: 'AuditLog', field: 'actorId' },
  { model: 'Lead', field: 'teacherId' },
  { model: 'TestResponse', field: 'reviewedById' },
  { model: 'QuestionFlag', field: 'resolvedById' },
];

export interface ReferenceCount extends UserReference {
  count: number;
}

/** "120 questions authored, 3 test attempts and 1 batch enrolment" style summary of what is in the way. */
export function describeReferences(counts: ReferenceCount[]): string {
  const parts = counts.filter((c) => c.count > 0).map((c) => `${c.count.toLocaleString('en-IN')} ${c.count === 1 ? c.one : c.label}`);
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
