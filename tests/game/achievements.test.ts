import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, counters, evaluate, type JournalEvent, newlyUnlocked } from '../../src/game/achievements.js';
import type { EventType } from '../../src/types.js';

const at = '2026-10-02T10:00:00.000Z';
const ev = (type: EventType, data: Record<string, unknown> = {}, when = at): JournalEvent => ({ type, at: when, data });
const done = (data: Record<string, unknown> = {}): JournalEvent => ev('quest_completed', { xp: 10, ...data });
const many = (n: number, data: Record<string, unknown> = {}): JournalEvent[] =>
  Array.from({ length: n }, () => done(data));
const ids = (events: JournalEvent[]): string[] => newlyUnlocked(events, at).map((event) => String(event.data?.id));

describe('counters', () => {
  it('counts completions, categories, levels, green runs and the special quests', () => {
    const c = counters([
      done({ category: 'bug', difficulty: 'easy', factor: 0.8 }),
      done({ category: 'bug', difficulty: 'hard', factor: 1, template: 'remove-hardcoded-secret' }),
      done({ category: 'security', difficulty: 'epic' }),
      ev('xp', { amount: 20, topUp: 'a' }),
      ev('xp', { amount: 80, quest: 'a' }),
      ev('level_up', { from: 1, to: 2 }),
      ev('level_up', { from: 2, to: 3 }),
      ev('analysis'),
    ]);
    expect(c).toEqual({ completed: 3, categories: 2, maxLevel: 3, green: 2, secret: 1, hard: 1, epic: 1 });
  });

  it('wrong-typed data counts as nothing, and a quest without a category is not a category', () => {
    const c = counters([
      done({ category: 5, difficulty: 7, factor: 'x' }),
      done({}),
      ev('xp', { amount: 'lots', topUp: 3 }),
      ev('level_up', { from: 'a', to: null }),
    ]);
    expect(c).toEqual({ completed: 2, categories: 0, maxLevel: 0, green: 0, secret: 0, hard: 0, epic: 0 });
  });
});

describe('evaluate', () => {
  it('lists the 11 achievements of the catalog with their value and goal', () => {
    expect(ACHIEVEMENTS.map((def) => def.id)).toEqual([
      'first-quest',
      'quests-10',
      'quests-50',
      'green-run',
      'level-5',
      'level-10',
      'level-25',
      'secret-keeper',
      'hard-mode',
      'epic-finish',
      'jack-of-all-trades',
    ]);
    const items = evaluate(many(3, { category: 'bug' }));
    expect(items).toHaveLength(11);
    expect(items.find((item) => item.id === 'quests-10')).toEqual({ id: 'quests-10', value: 3, goal: 10 });
    expect(items.find((item) => item.id === 'jack-of-all-trades')).toEqual({
      id: 'jack-of-all-trades',
      value: 1,
      goal: 5,
    });
  });

  it('takes unlockedAt from the first unlock event and ignores ids it does not know', () => {
    const items = evaluate([
      done(),
      ev('achievement_unlocked', { id: 'first-quest' }, '2026-10-01T09:00:00.000Z'),
      ev('achievement_unlocked', { id: 'first-quest' }, '2026-10-02T09:00:00.000Z'),
      ev('achievement_unlocked', { id: 'from-the-future' }),
    ]);
    expect(items).toHaveLength(11);
    expect(items.find((item) => item.id === 'first-quest')?.unlockedAt).toBe('2026-10-01T09:00:00.000Z');
    expect(items.find((item) => item.id === 'quests-10')?.unlockedAt).toBeUndefined();
  });
});

describe('newlyUnlocked', () => {
  it('opens a quest-count achievement exactly at its goal', () => {
    expect(ids(many(9))).toEqual(['first-quest']);
    expect(ids(many(10))).toEqual(['first-quest', 'quests-10']);
    expect(ids(many(50))).toEqual(['first-quest', 'quests-10', 'quests-50']);
  });

  it('writes events with the time given and the id of the achievement', () => {
    expect(newlyUnlocked(many(1), '2026-10-03T00:00:00.000Z')).toEqual([
      { at: '2026-10-03T00:00:00.000Z', type: 'achievement_unlocked', data: { id: 'first-quest' } },
    ]);
  });

  it('never opens an achievement twice: unlock events already in the journal are skipped', () => {
    const journal = [...many(10), ev('achievement_unlocked', { id: 'first-quest' })];
    expect(ids(journal)).toEqual(['quests-10']);
    const all = [...journal, ev('achievement_unlocked', { id: 'quests-10' })];
    expect(ids(all)).toEqual([]);
  });

  it('counts the events of the current cycle, which have no seq yet, together with the journal', () => {
    const journal = many(9);
    const cycle = [done(), ev('level_up', { from: 4, to: 5 })];
    expect(ids([...journal, ...cycle])).toEqual(['first-quest', 'quests-10', 'level-5']);
  });

  it('opens the other kinds on their conditions, and nothing on an empty journal', () => {
    expect(ids([])).toEqual([]);
    expect(ids([ev('level_up', { from: 9, to: 10 })])).toEqual(['level-5', 'level-10']);
    expect(ids([done({ factor: 1 })])).toEqual(['first-quest', 'green-run']);
    expect(ids([ev('xp', { amount: 20, topUp: 'a' })])).toEqual(['green-run']);
    expect(ids([done({ template: 'remove-hardcoded-secret', difficulty: 'hard' })])).toEqual([
      'first-quest',
      'secret-keeper',
      'hard-mode',
    ]);
    expect(ids([done({ difficulty: 'epic' })])).toEqual(['first-quest', 'epic-finish']);
    const categories = ['bug', 'testing', 'security', 'cleanup', 'architecture'].map((category) => done({ category }));
    expect(ids(categories.slice(0, 4))).toEqual(['first-quest']);
    expect(ids(categories)).toEqual(['first-quest', 'jack-of-all-trades']);
  });
});
