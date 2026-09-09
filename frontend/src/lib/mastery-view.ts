export type MasteryTopic = { topic: string; masteryScore: number; currentStreak?: number };

export function masteryBand(score: number) {
  if (score < 40) return 'needs_support' as const;
  if (score < 70) return 'developing' as const;
  return 'secure' as const;
}

export function masterySummary(topics: MasteryTopic[]) {
  const average = topics.length ? Math.round(topics.reduce((sum, item) => sum + item.masteryScore, 0) / topics.length) : 0;
  return {
    average,
    needsSupport: topics.filter((item) => masteryBand(item.masteryScore) === 'needs_support'),
    developing: topics.filter((item) => masteryBand(item.masteryScore) === 'developing'),
    secure: topics.filter((item) => masteryBand(item.masteryScore) === 'secure'),
  };
}
