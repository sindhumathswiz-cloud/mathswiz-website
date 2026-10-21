/**
 * Which existing section row each section of a saved manifest is, so a save updates sections in place instead of
 * replacing them. Questions are filed under a section (Question.bookExerciseId) and Smartbook links to sections by
 * id, so a replaced section would unlink its questions and, once published, leave the old row beside the new one on
 * the live site (publishing never deletes sections there).
 *
 * A section matches an existing one of the same type starting on the same page; failing that, the first unmatched
 * existing one of the same type, in order. Anything still unmatched is new; existing rows nothing matched are gone.
 */
export interface ExistingSection {
  id: string;
  sectionType: string | null;
  startPage: number | null;
}

export interface IncomingSectionKey {
  sectionType?: string | null;
  startPage?: number | null;
}

export function matchSections(existing: ExistingSection[], incoming: IncomingSectionKey[]): { ids: Array<string | null>; removed: string[] } {
  const used = new Set<string>();
  const type = (t: string | null | undefined) => (t ?? '').trim().toUpperCase();
  const ids: Array<string | null> = incoming.map((section) => {
    const hit = existing.find((e) => !used.has(e.id) && type(e.sectionType) === type(section.sectionType) && e.startPage === (section.startPage ?? null));
    if (hit) used.add(hit.id);
    return hit?.id ?? null;
  });
  incoming.forEach((section, i) => {
    if (ids[i]) return;
    const hit = existing.find((e) => !used.has(e.id) && type(e.sectionType) === type(section.sectionType));
    if (hit) { used.add(hit.id); ids[i] = hit.id; }
  });
  return { ids, removed: existing.filter((e) => !used.has(e.id)).map((e) => e.id) };
}
