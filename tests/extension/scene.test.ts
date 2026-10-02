import { describe, expect, it } from 'vitest';
import { backgroundTier, bossRatio, effectsBetween } from '../../vscode-extension/src/shared/scene.js';
import { parseState } from '../../vscode-extension/src/shared/state.js';

const doc = (over: Record<string, unknown> = {}) => {
  const parsed = parseState({ version: 1, level: 3, quests: { done: 4 }, bossesActive: 0, ...over });
  if (parsed === null) throw new Error('bad doc');
  return parsed;
};
const boss = (hp: number, id = 'graveyard') => ({ id, name: id, hp, max: 9 });

describe('effectsBetween', () => {
  it('fires nothing for the first document or for two equal ones', () => {
    expect(effectsBetween(null, doc())).toEqual([]);
    expect(effectsBetween(doc(), doc())).toEqual([]);
  });
  it('fires levelup and quest when they grow, never when they fall', () => {
    expect(effectsBetween(doc(), doc({ level: 4 }))).toEqual(['levelup']);
    expect(effectsBetween(doc(), doc({ quests: { done: 5 } }))).toEqual(['quest']);
    expect(effectsBetween(doc({ level: 4 }), doc({ level: 3 }))).toEqual([]);
    expect(effectsBetween(doc(), doc({ level: 4, quests: { done: 5 } }))).toEqual(['quest', 'levelup']);
  });
  it('fires boss_hit when the same boss loses hp and boss_defeated when the number of active bosses falls', () => {
    expect(effectsBetween(doc({ boss: boss(9), bossesActive: 1 }), doc({ boss: boss(6), bossesActive: 1 }))).toEqual([
      'boss_hit',
    ]);
    expect(effectsBetween(doc({ boss: boss(9), bossesActive: 1 }), doc({ boss: boss(12), bossesActive: 1 }))).toEqual(
      [],
    );
    expect(effectsBetween(doc({ boss: boss(2), bossesActive: 1 }), doc({ bossesActive: 0 }))).toEqual([
      'boss_defeated',
    ]);
    expect(
      effectsBetween(doc({ boss: boss(2), bossesActive: 2 }), doc({ boss: boss(4, 'breach'), bossesActive: 1 })),
    ).toEqual(['boss_defeated']);
  });
});

describe('bossRatio and backgroundTier', () => {
  it('keeps the ratio between 0 and 1', () => {
    expect(bossRatio({ hp: 5, max: 10 })).toBe(0.5);
    expect(bossRatio({ hp: 20, max: 10 })).toBe(1);
    expect(bossRatio({ hp: 0, max: 0 })).toBe(0);
  });
  it('has three tiers: 1–9, 10–29, 30–50', () => {
    expect([1, 9, 10, 29, 30, 50].map(backgroundTier)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});
