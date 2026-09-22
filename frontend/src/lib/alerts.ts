import { masteryBand } from './mastery-view';

export type AlertSeverity = 'warning' | 'info';

export interface Alert {
  type: 'INACTIVITY' | 'REPEATED_DIFFICULTY' | 'UPCOMING_ASSESSMENT';
  severity: AlertSeverity;
  title: string;
  detail: string;
}

const DEFAULT_INACTIVITY_THRESHOLD_DAYS = 7;

/**
 * Computed on demand (no cron infra anywhere in this codebase) from
 * User.lastActiveAt -- null/undefined (never active) is not itself an
 * inactivity alert; there's nothing to compare against yet.
 */
export function inactivityAlert(
  lastActiveAt: Date | null | undefined,
  thresholdDays: number = DEFAULT_INACTIVITY_THRESHOLD_DAYS,
  now: Date = new Date(),
): Alert | null {
  if (!lastActiveAt) return null;
  const daysSince = Math.floor((now.getTime() - lastActiveAt.getTime()) / (24 * 60 * 60 * 1000));
  if (daysSince < thresholdDays) return null;
  return {
    type: 'INACTIVITY',
    severity: 'warning',
    title: `No activity in ${daysSince} days`,
    detail: `Last seen ${daysSince} days ago — check in on progress.`,
  };
}

export interface ProgressRow {
  topic: string;
  masteryScore: number;
}

/** Reuses the same needs_support (<40) band as everywhere else in the app. */
export function repeatedDifficultyAlert(progressRows: ProgressRow[]): Alert | null {
  const strugglingTopics = progressRows.filter((p) => masteryBand(p.masteryScore) === 'needs_support');
  if (strugglingTopics.length === 0) return null;
  const topicList = strugglingTopics.map((p) => p.topic).join(', ');
  return {
    type: 'REPEATED_DIFFICULTY',
    severity: 'warning',
    title: `${strugglingTopics.length} topic${strugglingTopics.length === 1 ? '' : 's'} need${strugglingTopics.length === 1 ? 's' : ''} support`,
    detail: topicList,
  };
}

export interface AssignmentRow {
  id: string;
  title: string;
  deadline: Date;
}

/** Same window logic already proven in api/student/planner/route.ts. */
export function upcomingAssessmentAlert(assignments: AssignmentRow[], windowDays: number = 7, now: Date = new Date()): Alert | null {
  const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
  const upcoming = assignments.filter((a) => a.deadline >= now && a.deadline <= windowEnd);
  if (upcoming.length === 0) return null;
  const soonest = [...upcoming].sort((a, b) => a.deadline.getTime() - b.deadline.getTime())[0];
  return {
    type: 'UPCOMING_ASSESSMENT',
    severity: 'info',
    title: `${upcoming.length} assessment${upcoming.length === 1 ? '' : 's'} due this week`,
    detail: `Next: ${soonest.title}`,
  };
}

export function computeAlerts(input: {
  lastActiveAt?: Date | null;
  progressRows: ProgressRow[];
  assignments: AssignmentRow[];
  now?: Date;
}): Alert[] {
  const now = input.now ?? new Date();
  return [
    inactivityAlert(input.lastActiveAt, undefined, now),
    repeatedDifficultyAlert(input.progressRows),
    upcomingAssessmentAlert(input.assignments, undefined, now),
  ].filter((a): a is Alert => a !== null);
}
