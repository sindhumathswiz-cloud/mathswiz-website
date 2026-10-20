import { NON_QUESTION_SECTION_TYPES } from './book-manifest';

/**
 * Which exercise a question belongs to, from the confirmed manifest: the one question section of its chapter whose
 * page range contains the page the question starts on. When none does, or two do (one exercise ends and the next
 * begins on the same page), there is no single answer and the question is left unlinked; the page-range matching
 * in question-source-filter.ts still finds it under either exercise.
 */
export interface ExercisePages {
  id: string;
  sectionType: string | null;
  startPage: number | null;
  endPage: number | null;
}

export function exerciseForPage(exercises: ExercisePages[], page: number | null | undefined): string | null {
  if (page == null) return null;
  const containing = exercises.filter((exercise) =>
    !(exercise.sectionType && NON_QUESTION_SECTION_TYPES.has(exercise.sectionType))
    && exercise.startPage != null && exercise.endPage != null
    && page >= exercise.startPage && page <= exercise.endPage);
  return containing.length === 1 ? containing[0].id : null;
}
