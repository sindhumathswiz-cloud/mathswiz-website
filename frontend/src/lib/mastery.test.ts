import { describe, expect, it, vi } from 'vitest';
import { applyMasteryUpdate, deltaForAttempt } from './mastery';

function makeClient(masteryScore: number, currentStreak = 0) {
  return {
    studentProgress: { findUnique: vi.fn().mockResolvedValue({ masteryScore, currentStreak }), upsert: vi.fn().mockResolvedValue({}) },
    masteryEvent: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe('deltaForAttempt', () => {
  it('rewards a correct HARD answer more than a correct EASY one', () => {
    expect(deltaForAttempt(true, 'HARD')).toBeGreaterThan(deltaForAttempt(true, 'EASY'));
  });

  it('penalizes a missed EASY question more than a missed HARD one', () => {
    expect(deltaForAttempt(false, 'EASY')).toBeLessThan(deltaForAttempt(false, 'HARD'));
  });

  it('falls back to the flat +5/-2 delta for missing or unrecognized difficulty', () => {
    expect(deltaForAttempt(true, undefined)).toBe(5);
    expect(deltaForAttempt(true, null)).toBe(5);
    expect(deltaForAttempt(true, 'NOT_A_DIFFICULTY')).toBe(5);
    expect(deltaForAttempt(false, undefined)).toBe(-2);
  });
});

describe('applyMasteryUpdate', () => {
  it('clamps mastery and records the effective delta (no difficulty — flat default)', async () => {
    const client = makeClient(98, 2);
    expect(await applyMasteryUpdate(client, { userId: 'student-1', topic: 'Algebra', isCorrect: true, source: 'TEST', attemptId: 'attempt-1', questionId: 'question-1' })).toEqual({ previousScore: 98, newScore: 100, delta: 2 });
    expect(client.masteryEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ source: 'TEST', previousScore: 98, newScore: 100, delta: 2 }) }));
  });

  it('does not reduce mastery below zero', async () => {
    const client = makeClient(1, 3);
    expect((await applyMasteryUpdate(client, { userId: 'student-1', topic: 'Geometry', isCorrect: false, source: 'HOMEWORK' })).newScore).toBe(0);
  });

  it('moves mastery further on a correct HARD answer than a correct EASY answer', async () => {
    const hardClient = makeClient(50);
    const easyClient = makeClient(50);
    const hardResult = await applyMasteryUpdate(hardClient, { userId: 'student-1', topic: 'Calculus', isCorrect: true, source: 'PRACTICE', difficulty: 'HARD' });
    const easyResult = await applyMasteryUpdate(easyClient, { userId: 'student-1', topic: 'Calculus', isCorrect: true, source: 'PRACTICE', difficulty: 'EASY' });
    expect(hardResult.delta).toBeGreaterThan(easyResult.delta);
  });

  it('drops mastery further on a missed EASY answer than a missed HARD answer', async () => {
    const easyClient = makeClient(50);
    const hardClient = makeClient(50);
    const easyResult = await applyMasteryUpdate(easyClient, { userId: 'student-1', topic: 'Calculus', isCorrect: false, source: 'PRACTICE', difficulty: 'EASY' });
    const hardResult = await applyMasteryUpdate(hardClient, { userId: 'student-1', topic: 'Calculus', isCorrect: false, source: 'PRACTICE', difficulty: 'HARD' });
    expect(easyResult.delta).toBeLessThan(hardResult.delta);
  });
});
