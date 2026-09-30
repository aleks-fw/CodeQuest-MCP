import { describe, expect, it } from 'vitest';
import { pendingTopUps } from '../../src/game/topup.js';
import type { GameEvent } from '../../src/types.js';

const event = (seq: number, type: GameEvent['type'], data: Record<string, unknown>): GameEvent => ({
  seq,
  at: '2026-09-30T12:00:00.000Z',
  type,
  data,
});

describe('XP owed to quests completed without a green run', () => {
  it('finds the missing part from the factor, and skips full payments', () => {
    const events = [
      event(1, 'quest_completed', { id: 'a', xp: 400, factor: 0.8 }),
      event(2, 'quest_completed', { id: 'b', xp: 100, factor: 1 }),
      event(3, 'quest_completed', { id: 'c', xp: 0, factor: 0.8 }),
    ];
    expect(pendingTopUps(events)).toEqual([{ quest: 'a', missing: 100 }]);
  });

  it('a quest already topped up is not owed again', () => {
    const events = [
      event(1, 'quest_completed', { id: 'a', xp: 80, factor: 0.8 }),
      event(2, 'xp', { amount: 20, quest: 'a', topUp: 'a' }),
    ];
    expect(pendingTopUps(events)).toEqual([]);
  });

  it('ignores events with broken data', () => {
    expect(pendingTopUps([event(1, 'quest_completed', { id: 'a', xp: 'x', factor: 0.8 })])).toEqual([]);
  });
});
