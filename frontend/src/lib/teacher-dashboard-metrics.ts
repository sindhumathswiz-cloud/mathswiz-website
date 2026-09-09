type AttemptMetric = {
  endTime?: Date | string | null;
  startTime: Date | string;
  totalScore: number;
  test?: { totalMarks: number } | null;
};

export function buildWeeklyEngagement(attempts: AttemptMetric[], now = new Date()) {
  const currentWeek = new Date(now);
  currentWeek.setHours(0, 0, 0, 0);
  currentWeek.setDate(currentWeek.getDate() - currentWeek.getDay());

  const weeks = Array.from({ length: 6 }, (_, index) => {
    const weekStart = new Date(currentWeek);
    weekStart.setDate(weekStart.getDate() - (5 - index) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const scores = attempts.flatMap((attempt) => {
      const completedAt = new Date(attempt.endTime || attempt.startTime);
      const totalMarks = attempt.test?.totalMarks || 0;
      if (completedAt < weekStart || completedAt >= weekEnd || totalMarks <= 0) return [];
      return [Math.max(0, Math.min(100, (attempt.totalScore / totalMarks) * 100))];
    });
    return {
      week: weekStart.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      score: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
    };
  });

  return weeks.some((week) => week.score > 0) ? weeks : [];
}
