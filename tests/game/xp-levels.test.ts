import { describe, expect, it } from 'vitest';
import { hudTitle, levelForXp, levelProgress, MAX_LEVEL, TITLES, titleForLevel } from '../../src/game/levels.js';
import { awardForQuest, questReward, verificationFactor } from '../../src/game/xp.js';
import type { Quest } from '../../src/types.js';

function quest(difficulty: Quest['difficulty'], findings: string[]): Quest {
  return {
    id: 'q',
    template: 't',
    pack: 'generic',
    title: 'Quest',
    description: '',
    category: 'bug',
    difficulty,
    findings,
    criteria: [],
    status: 'open',
    createdAt: '2026-09-30T00:00:00.000Z',
    baseline: {
      head: null,
      takenAt: '',
      findings: [],
      highFindings: [],
      testCasesTotal: 0,
      testCasesByModule: {},
      codeLines: 0,
      fileLines: {},
      botHandlers: 0,
      scripts: {},
    },
  };
}

describe('levels', () => {
  it('is ⌊XP / 500⌋ + 1, capped at 50', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(499)).toBe(1);
    expect(levelForXp(500)).toBe(2);
    expect(levelForXp(24_499)).toBe(49);
    expect(levelForXp(24_500)).toBe(50);
    expect(levelForXp(1_000_000)).toBe(50);
  });

  it('treats negative and broken XP as 0', () => {
    expect(levelForXp(-5)).toBe(1);
    expect(levelForXp(Number.NaN)).toBe(1);
  });

  it('has 50 distinct titles, first Newcomer and last LEGEND', () => {
    expect(TITLES).toHaveLength(MAX_LEVEL);
    expect(new Set(TITLES).size).toBe(MAX_LEVEL);
    expect(titleForLevel(1)).toBe('Newcomer');
    expect(titleForLevel(8)).toBe('Bug Hunter');
    expect(titleForLevel(30)).toBe('Senior Architect');
    expect(titleForLevel(50)).toBe('LEGEND');
    expect(titleForLevel(0)).toBe('Newcomer');
    expect(titleForLevel(99)).toBe('LEGEND');
    expect(hudTitle(3)).toBe('CODER');
  });

  it('reports progress inside a level and MAX after level 50', () => {
    expect(levelProgress(0)).toEqual({ level: 1, title: 'Newcomer', xpIntoLevel: 0, xpToNext: 500, max: false });
    expect(levelProgress(730)).toMatchObject({ level: 2, xpIntoLevel: 230, xpToNext: 270, max: false });
    expect(levelProgress(24_500)).toMatchObject({ level: 50, xpIntoLevel: 0, xpToNext: null, max: true });
    expect(levelProgress(30_000)).toMatchObject({ level: 50, xpIntoLevel: 5500, xpToNext: null, max: true });
  });
});

describe('quest reward', () => {
  // The table of spec §6: reward per level and difficulty with a green run (V = 1).
  it.each([
    [1, 100, 300, 500, 1200],
    [10, 63, 189, 315, 756],
    [20, 38, 113, 189, 453],
    [30, 23, 68, 113, 271],
    [40, 14, 41, 68, 162],
    [50, 8, 24, 40, 97],
  ] as const)('level %i pays %i / %i / %i / %i', (level, easy, medium, hard, epic) => {
    expect(questReward('easy', level, 1)).toBe(easy);
    expect(questReward('medium', level, 1)).toBe(medium);
    expect(questReward('hard', level, 1)).toBe(hard);
    expect(questReward('epic', level, 1)).toBe(epic);
  });

  it('applies the 0.8 factor and never pays less than 1', () => {
    expect(questReward('medium', 1, 0.8)).toBe(240);
    expect(questReward('easy', 50, 0.8)).toBe(6);
    expect(questReward('easy', 5000, 0.8)).toBe(1);
  });

  it('gives V = 1 only for a green run of all commands with unchanged scripts', () => {
    const ok = { ranAnyCommand: true, allGreen: true, scriptsUnchanged: true };
    expect(verificationFactor(ok)).toBe(1);
    expect(verificationFactor({ ...ok, ranAnyCommand: false })).toBe(0.8);
    expect(verificationFactor({ ...ok, allGreen: false })).toBe(0.8);
    expect(verificationFactor({ ...ok, scriptsUnchanged: false })).toBe(0.8);
  });
});

describe('awardForQuest', () => {
  it('pays the reward and lists the findings to mark as paid', () => {
    expect(awardForQuest(quest('medium', ['b', 'a', 'a']), 1, 1, [])).toEqual({ amount: 300, findings: ['a', 'b'] });
  });

  it('pays once per finding: a quest whose findings were all paid gives nothing', () => {
    expect(awardForQuest(quest('hard', ['a']), 3, 1, ['a', 'x'])).toEqual({ amount: 0, findings: [] });
  });

  it('pays in full when at least one finding is new and only lists the new ones', () => {
    expect(awardForQuest(quest('easy', ['a', 'b']), 1, 1, ['a'])).toEqual({ amount: 100, findings: ['b'] });
  });

  it('pays a quest without findings (target-only quests) and pays nothing extra to mark', () => {
    expect(awardForQuest(quest('easy', []), 1, 1, [])).toEqual({ amount: 100, findings: [] });
  });
});
