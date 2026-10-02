import { describe, expect, it } from 'vitest';
import { payable, pendingTopUps } from '../../src/game/topup.js';
import type { GameEvent, Quest } from '../../src/types.js';

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

describe('payable top-ups', () => {
  const quest = (baseline: Record<string, string>) =>
    ({
      id: 'a',
      criteria: [{ type: 'command_passes', params: { command: 'test' } }],
      baseline: { scripts: baseline },
    }) as unknown as Quest;
  const item = { quest: 'a', missing: 20 };

  it('keeps a top-up that a green run of an existing command can pay', () => {
    const facts = { commands: { test: 'npm test' }, scripts: { test: 'vitest' } };
    expect(payable([item], () => quest({ test: 'vitest' }), facts)).toEqual([item]);
  });

  it('drops it when no command confirms the quest, the script was edited or the quest is gone', () => {
    expect(payable([item], () => quest({}), { commands: {}, scripts: {} })).toEqual([]);
    const edited = { commands: { test: 'npm test' }, scripts: { test: 'vitest --changed' } };
    expect(payable([item], () => quest({ test: 'vitest' }), edited)).toEqual([]);
    expect(payable([item], () => undefined, { commands: { test: 'npm test' }, scripts: {} })).toEqual([]);
  });
});

describe('top-ups that a run can still pay', () => {
  const quest = {
    id: 'a',
    criteria: [{ type: 'command_passes', params: { command: 'test' } }],
    baseline: { scripts: { test: 'vitest' } },
  } as unknown as Quest;
  const item = { quest: 'a', missing: 20 };
  const facts = { commands: { test: 'npm test' }, scripts: { test: 'vitest' } };

  it('is dropped when every confirming command already ran on this state of the code', () => {
    expect(
      payable(
        [item],
        () => quest,
        facts,
        () => false,
      ),
    ).toEqual([]);
    expect(
      payable(
        [item],
        () => quest,
        facts,
        () => true,
      ),
    ).toEqual([item]);
    expect(payable([item], () => quest, facts)).toEqual([item]);
  });

  it('is found from events of the current cycle too, which have no seq', () => {
    const cycle = [{ type: 'quest_completed' as const, at: 'x', data: { id: 'a', xp: 80, factor: 0.8 } }];
    expect(pendingTopUps(cycle)).toEqual([{ quest: 'a', missing: 20 }]);
    const paid = [...cycle, { type: 'xp' as const, at: 'x', data: { amount: 20, topUp: 'a' } }];
    expect(pendingTopUps(paid)).toEqual([]);
  });
});
