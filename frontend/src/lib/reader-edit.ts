/**
 * The correction a teacher makes beside the book: which fields they actually changed, so only those are
 * saved (and only a real edit counts as unsaved).
 */

export interface QuestionDraft {
  content: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

/** A question's stored options as a list of strings, whatever shape they were stored in. */
export function optionsOf(value: unknown): string[] {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(parsed) ? parsed.map((option) => String(option ?? '')) : [];
}

/** The fields of `after` that differ from `before`, ready to send as a PATCH body. */
export function editedFields(before: QuestionDraft, after: QuestionDraft): Partial<QuestionDraft> {
  const changes: Partial<QuestionDraft> = {};
  if (after.content !== before.content) changes.content = after.content;
  if (after.correctAnswer !== before.correctAnswer) changes.correctAnswer = after.correctAnswer;
  if (after.explanation !== before.explanation) changes.explanation = after.explanation;
  if (after.options.length !== before.options.length || after.options.some((option, i) => option !== before.options[i])) changes.options = after.options;
  return changes;
}
