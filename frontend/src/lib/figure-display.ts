import prisma from './prisma';

/**
 * The figures students and teachers see under a question: crops from the book page (PageFigure) a person has
 * confirmed in the figure review screen -- an automatic match by position can sit on the wrong question, the same
 * reason approval waits for that review (lib/question-figures.ts) -- and images attached to the question by hand
 * (QuestionImage). Only for approved questions; an admin also sees them on unapproved ones.
 *
 * Crops live in private storage behind an admin-only route, so they are served to everyone else through
 * /api/figures/[kind]/[id] under the same rule; an image hosted elsewhere is shown at its own address.
 */

export type FigureKind = 'page' | 'image';

export interface DisplayFigure {
  url: string;
  caption: string | null;
}

const ADMIN_IMAGE = /^\/api\/admin\/books\/([^/]+)\/ingestions\/([^/]+)\/question-images\/([^/?#]+)$/;

/** Where a stored crop lives, from its admin URL. */
export function parseAdminImageUrl(url: string): { bookId: string; runId: string; fileName: string } | null {
  const m = url.match(ADMIN_IMAGE);
  return m ? { bookId: m[1], runId: m[2], fileName: m[3] } : null;
}

/** The address a student's browser loads a figure from, or null when it cannot be shown (a missing local file). */
export function viewerUrlFor(kind: FigureKind, id: string, imageUrl: string): string | null {
  if (parseAdminImageUrl(imageUrl)) return `/api/figures/${kind}/${id}`;
  if (/^https:\/\//i.test(imageUrl) || /^data:image\//i.test(imageUrl)) return imageUrl;
  return null;
}

const statusAllowed = (includeUnapproved: boolean) => (includeUnapproved ? {} : { status: 'APPROVED' as const });

/** The figures to show under each of these questions, by question id. */
export async function displayableFigures(questionIds: string[], { includeUnapproved = false } = {}): Promise<Record<string, DisplayFigure[]>> {
  const ids = [...new Set(questionIds)].slice(0, 200);
  const out: Record<string, DisplayFigure[]> = {};
  if (!ids.length) return out;
  const question = { id: { in: ids }, ...statusAllowed(includeUnapproved) };
  const [crops, images] = await Promise.all([
    prisma.pageFigure.findMany({ where: { question }, orderBy: [{ pageNumber: 'asc' }, { orderIndex: 'asc' }], select: { id: true, questionId: true, imageUrl: true, reviewedAt: true } }),
    prisma.questionImage.findMany({ where: { question }, orderBy: { orderIndex: 'asc' }, select: { id: true, questionId: true, imageUrl: true, caption: true } }),
  ]);
  for (const f of crops) {
    const url = f.reviewedAt ? viewerUrlFor('page', f.id, f.imageUrl) : null;
    if (url && f.questionId) (out[f.questionId] ??= []).push({ url, caption: null });
  }
  // An attached image that is the same file as a page crop follows that crop's review (an older migration copied
  // crops into both tables); it is never shown on its own.
  const cropFiles = new Set(crops.map((f) => `${f.questionId}|${f.imageUrl}`));
  for (const i of images) {
    if (cropFiles.has(`${i.questionId}|${i.imageUrl}`)) continue;
    const url = viewerUrlFor('image', i.id, i.imageUrl);
    if (url) (out[i.questionId] ??= []).push({ url, caption: i.caption });
  }
  return out;
}

/** The stored crop behind /api/figures/[kind]/[id], when its question may be shown. */
export async function figureFile(kind: FigureKind, id: string, { includeUnapproved = false } = {}): Promise<{ bookId: string; runId: string; fileName: string } | null> {
  const question = statusAllowed(includeUnapproved);
  if (kind === 'page') {
    const row = await prisma.pageFigure.findFirst({ where: { id, reviewedAt: { not: null }, question }, select: { imageUrl: true } });
    return row ? parseAdminImageUrl(row.imageUrl) : null;
  }
  const row = await prisma.questionImage.findFirst({ where: { id, question }, select: { imageUrl: true, questionId: true } });
  if (!row) return null;
  // The same file as an unreviewed page crop of the same question is not served as an attached image either.
  const unreviewedCrop = await prisma.pageFigure.findFirst({ where: { questionId: row.questionId, imageUrl: row.imageUrl, reviewedAt: null }, select: { id: true } });
  return unreviewedCrop ? null : parseAdminImageUrl(row.imageUrl);
}
