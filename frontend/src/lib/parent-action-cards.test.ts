import { describe, expect, it } from 'vitest';
import { buildActionCards } from './parent-action-cards';
import type { Alert } from './alerts';

const inactivityAlert: Alert = { type: 'INACTIVITY', severity: 'warning', title: 'No activity in 10 days', detail: 'Last seen 10 days ago' };
const upcomingAlert: Alert = { type: 'UPCOMING_ASSESSMENT', severity: 'info', title: '1 assessment due this week', detail: 'Next: Mock Exam' };

describe('buildActionCards', () => {
  it('returns the empty "nothing needs attention" card when there are no alerts or comments', () => {
    const cards = buildActionCards({ alerts: [], teacherComments: [] });
    expect(cards).toHaveLength(1);
    expect(cards[0].tone).toBe('success');
  });

  it('turns each alert into a card, warning severity mapped to attention tone', () => {
    const cards = buildActionCards({ alerts: [inactivityAlert], teacherComments: [] });
    expect(cards).toHaveLength(1);
    expect(cards[0].tone).toBe('attention');
    expect(cards[0].title).toBe(inactivityAlert.title);
  });

  it('maps an info-severity alert to a neutral tone', () => {
    const cards = buildActionCards({ alerts: [upcomingAlert], teacherComments: [] });
    expect(cards[0].tone).toBe('neutral');
  });

  it('appends only the single most recent teacher comment as its own card', () => {
    const cards = buildActionCards({
      alerts: [],
      teacherComments: [
        { title: 'Algebra Test', comment: 'Great improvement', at: new Date() },
        { title: 'Geometry Test', comment: 'Needs more practice', at: new Date() },
      ],
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].detail).toBe('Great improvement');
  });

  it('combines alerts and a comment card together, alerts first', () => {
    const cards = buildActionCards({
      alerts: [inactivityAlert],
      teacherComments: [{ title: 'Algebra Test', comment: 'Great improvement', at: new Date() }],
    });
    expect(cards).toHaveLength(2);
    expect(cards[0].title).toBe(inactivityAlert.title);
    expect(cards[1].title).toContain('Algebra Test');
  });
});
