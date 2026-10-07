/**
 * Internal choice: two (or more) questions in a section that are alternatives, so the
 * student answers one of them ("Q3 OR Q4" in a board paper). They share a `choiceGroup`
 * label. A group counts as one question slot for marks, for "how many questions" and
 * for "answered"; only one member's answer is ever scored.
 *
 * Pure helpers shared by the builder, the server and the exam screen.
 */

export interface GroupedQuestion {
  id: string;
  choiceGroup?: string | null;
}

/** What a question occupies in the paper: its group, or itself when it has no alternative. */
export const slotKeyOf = (question: GroupedQuestion): string => question.choiceGroup ? `group:${question.choiceGroup}` : `question:${question.id}`;

/** How many questions the student actually has to deal with: each group counts once. */
export function slotCountOf(questions: GroupedQuestion[]): number {
  return new Set(questions.map(slotKeyOf)).size;
}

/** Whether any question in the list has an alternative. */
export const hasChoiceGroups = (questions: GroupedQuestion[]): boolean => questions.some(q => !!q.choiceGroup);

/**
 * Keeps a group only if it is a run of two or more neighbouring questions. A group a
 * reorder has split, or one a removal has left with a single member, stops being a
 * group instead of leaving a dangling "OR".
 */
export function normalizeChoiceGroups<T extends GroupedQuestion>(questions: T[]): T[] {
  const runs = new Map<string, { start: number; length: number; broken: boolean }>();
  questions.forEach((question, index) => {
    const group = question.choiceGroup;
    if (!group) return;
    const run = runs.get(group);
    if (!run) runs.set(group, { start: index, length: 1, broken: false });
    else if (run.start + run.length === index) run.length += 1;
    else run.broken = true;
  });
  return questions.map(question => {
    const run = question.choiceGroup ? runs.get(question.choiceGroup) : undefined;
    if (!question.choiceGroup || (run && !run.broken && run.length >= 2)) return question;
    return { ...question, choiceGroup: null };
  });
}

/**
 * Link the question at `index` as an alternative to the one before it, or unlink it if
 * it already is one. `newGroup` names the group when a new one is started.
 */
export function toggleAlternative<T extends GroupedQuestion>(questions: T[], index: number, newGroup: string): T[] {
  if (index <= 0 || index >= questions.length) return questions;
  const previous = questions[index - 1];
  const current = questions[index];
  const linked = !!current.choiceGroup && current.choiceGroup === previous.choiceGroup;
  const next = questions.map((question, i) => {
    if (linked) return i === index ? { ...question, choiceGroup: null } : question;
    const group = previous.choiceGroup ?? newGroup;
    return i === index - 1 || i === index ? { ...question, choiceGroup: group } : question;
  });
  return normalizeChoiceGroups(next);
}

/** For the server: only well-formed, short group labels survive, and only as runs of two or more. */
export function sanitizeChoiceGroups<T extends GroupedQuestion>(questions: T[]): T[] {
  const cleaned = questions.map(question => {
    const group = typeof question.choiceGroup === 'string' ? question.choiceGroup.trim() : '';
    return /^[A-Za-z0-9_-]{1,40}$/.test(group) ? { ...question, choiceGroup: group } : { ...question, choiceGroup: null };
  });
  return normalizeChoiceGroups(cleaned);
}
