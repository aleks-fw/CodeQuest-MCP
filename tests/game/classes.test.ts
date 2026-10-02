import { describe, expect, it } from 'vitest';
import { CLASSES, type ClassEvent, classOf } from '../../src/game/classes.js';

let counter = 0;
const q = (category: unknown, difficulty: unknown, id: string | undefined = `q${++counter}`): ClassEvent => ({
  type: 'quest_completed',
  data: { category, difficulty, ...(id === undefined ? {} : { id }) },
});

describe('classOf', () => {
  it('weighs quests by difficulty and orders the classes by their share', () => {
    const player = classOf([q('architecture', 'medium'), q('architecture', 'easy'), q('testing', 'hard')]);
    expect(player?.primary).toBe('tester');
    expect(player?.secondary).toBe('architect');
    expect(player?.shares.map((share) => share.id)).toEqual(['tester', 'architect']);
    expect(player?.shares[0]?.share).toBeCloseTo(500 / 900);
    expect(player?.shares[1]?.share).toBeCloseTo(400 / 900);
  });

  it('is one class, without a hybrid, when all the work is of one kind', () => {
    const player = classOf([q('testing', 'easy'), q('testing', 'easy'), q('testing', 'epic')]);
    expect(player).toEqual({ primary: 'tester', shares: [{ id: 'tester', share: 1 }], stats: ['testing'] });
  });

  it('needs 3 counted quests: fewer, or many outside the classes, give no class', () => {
    expect(classOf([])).toBeNull();
    expect(classOf([q('testing', 'hard'), q('testing', 'hard')])).toBeNull();
    const outside = [q('documentation', 'easy'), q('dependencies', 'easy'), q('documentation', 'hard')];
    expect(classOf([q('bug', 'easy'), q('bug', 'easy'), ...outside, ...outside])).toBeNull();
    expect(classOf([q('bug', 'easy'), q('bug', 'easy'), q('bug', 'easy'), ...outside])?.primary).toBe('bug-hunter');
  });

  it('counts a quest once, however often it was completed', () => {
    const same = Array.from({ length: 6 }, () => q('architecture', 'medium', 'same'));
    expect(classOf(same)).toBeNull();
    expect(classOf([...same, q('testing', 'easy'), q('testing', 'easy')])?.shares).toHaveLength(2);
    const twoMore = classOf([...same, q('architecture', 'easy'), q('architecture', 'easy')]);
    expect(twoMore?.shares).toEqual([{ id: 'architect', share: 1 }]);
  });

  it('counts an event without an id as its own quest', () => {
    const none = [q('testing', 'easy', undefined), q('testing', 'easy', undefined), q('testing', 'easy', undefined)];
    expect(classOf(none)?.primary).toBe('tester');
  });

  it('ignores wrong-typed or unknown data without failing', () => {
    const odd = [q(5, 'easy'), q('testing', 7), q('testing', 'huge'), q(undefined, 'easy'), q('bug', null)];
    expect(classOf([...odd, q('bug', 'easy'), q('bug', 'easy')])).toBeNull();
    expect(classOf([...odd, q('bug', 'easy'), q('bug', 'easy'), q('bug', 'easy')])?.primary).toBe('bug-hunter');
    expect(classOf([{ type: 'quest_completed' }, { type: 'level_up', data: { to: 5 } }])).toBeNull();
  });

  it('puts equal shares in the order of the table', () => {
    const player = classOf([q('security', 'medium'), q('testing', 'medium'), q('architecture', 'medium')]);
    expect(player?.shares.map((share) => share.id)).toEqual(['architect', 'tester', 'guardian']);
    expect(player?.primary).toBe('architect');
  });

  it('maps every category of the table to its class', () => {
    const pick = (category: string) =>
      classOf([q(category, 'easy'), q(category, 'easy'), q(category, 'easy')])?.primary;
    expect(pick('architecture')).toBe('architect');
    expect(pick('testing')).toBe('tester');
    expect(pick('security')).toBe('guardian');
    expect(pick('reliability')).toBe('guardian');
    expect(pick('performance')).toBe('optimizer');
    expect(pick('cleanup')).toBe('cleaner');
    expect(pick('refactoring')).toBe('cleaner');
    expect(pick('maintainability')).toBe('cleaner');
    expect(pick('bug')).toBe('bug-hunter');
    expect(CLASSES).toHaveLength(6);
  });
});

describe('the hybrid', () => {
  it('is made when the second class has exactly 60% of the first, not below', () => {
    const exact = classOf([q('architecture', 'hard'), q('testing', 'medium'), q('bug', 'easy')]);
    expect(exact?.secondary).toBe('tester');
    const below = classOf([q('architecture', 'hard'), q('testing', 'easy'), q('testing', 'easy')]);
    expect(below?.primary).toBe('architect');
    expect(below?.secondary).toBeUndefined();
  });

  it('needs the second class to have at least 20% of all the work', () => {
    const five = [
      q('architecture', 'hard'),
      q('testing', 'medium'),
      q('security', 'medium'),
      q('performance', 'medium'),
      q('cleanup', 'easy'),
    ];
    expect(classOf(five)?.secondary).toBe('tester');
    expect(classOf([...five, q('bug', 'medium')])?.secondary).toBeUndefined();
  });

  it('takes only the two biggest into the name and lists the stats of the primary class, then of the second', () => {
    const player = classOf([q('architecture', 'medium'), q('testing', 'medium'), q('maintainability', 'medium')]);
    expect(player?.primary).toBe('architect');
    expect(player?.secondary).toBe('tester');
    expect(player?.shares).toHaveLength(3);
    expect(player?.stats).toEqual(['architecture', 'maintainability', 'testing']);
  });
});
