import type { Alert } from './alerts';

export interface TeacherCommentInput {
  title: string;
  comment: string;
  at: string | Date | null;
}

export interface ActionCard {
  title: string;
  detail: string;
  tone: 'attention' | 'neutral' | 'success';
  href: string;
}

/**
 * "What can I do this week" -- composed entirely from lib/alerts.ts's
 * already-computed signals plus recent teacher comments, not a separate
 * data source. Deliberately does NOT take a separate "risks" list: alerts
 * already includes REPEATED_DIFFICULTY from the same masteryBand threshold,
 * so a second risks input would just double-count the same topics.
 */
export function buildActionCards(input: { alerts: Alert[]; teacherComments: TeacherCommentInput[] }): ActionCard[] {
  const cards: ActionCard[] = [];

  for (const alert of input.alerts) {
    cards.push({
      title: alert.title,
      detail: alert.detail,
      tone: alert.severity === 'warning' ? 'attention' : 'neutral',
      href: '/parent/dashboard',
    });
  }

  const latestComment = input.teacherComments[0];
  if (latestComment) {
    cards.push({
      title: `Teacher feedback on ${latestComment.title}`,
      detail: latestComment.comment,
      tone: 'neutral',
      href: '/parent/dashboard',
    });
  }

  if (cards.length === 0) {
    cards.push({
      title: 'Nothing needs your attention this week',
      detail: 'Progress, attendance, and upcoming assessments all look on track.',
      tone: 'success',
      href: '/parent/dashboard',
    });
  }

  return cards;
}
