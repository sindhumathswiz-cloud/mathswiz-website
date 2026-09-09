import { describe, expect, it } from "vitest";
import { buildWeeklyEngagement } from "./teacher-dashboard-metrics";

describe("teacher dashboard metrics", () => {
  it("returns an honest empty series when no tests were completed", () => {
    expect(buildWeeklyEngagement([], new Date("2026-08-02T12:00:00Z"))).toEqual([]);
  });

  it("calculates weekly percentages from real scores", () => {
    const result = buildWeeklyEngagement([
      { startTime: "2026-07-30T10:00:00Z", endTime: "2026-07-30T11:00:00Z", totalScore: 40, test: { totalMarks: 50 } },
      { startTime: "2026-07-31T10:00:00Z", endTime: "2026-07-31T11:00:00Z", totalScore: 30, test: { totalMarks: 50 } },
    ], new Date("2026-08-02T12:00:00Z"));

    expect(result.find((week) => week.score > 0)?.score).toBe(70);
  });
});
