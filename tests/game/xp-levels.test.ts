import { describe, expect, it } from 'vitest';
import {
  hudTitle,
  levelForXp,
  levelProgress,
  MAX_LEVEL,
  TITLES,
  titleForLevel,
  xpAtLevel,
  xpForNext,
} from '../../src/game/levels.js';
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
  it('costs 500 XP for the first step and 50 more for every next one, capped at level 50', () => {
    expect(xpForNext(1)).toBe(500);
    expect(xpForNext(2)).toBe(550);
    expect(xpForNext(10)).toBe(950);
    expect(xpAtLevel(1)).toBe(0);
    expect(xpAtLevel(2)).toBe(500);
    expect(xpAtLevel(3)).toBe(1050);
    expect(xpAtLevel(33)).toBe(40_800);
    expect(xpAtLevel(50)).toBe(83_300);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(499)).toBe(1);
    expect(levelForXp(500)).toBe(2);
    expect(levelForXp(1049)).toBe(2);
    expect(levelForXp(1050)).toBe(3);
    expect(levelForXp(40_799)).toBe(32);
    expect(levelForXp(40_800)).toBe(33);
    expect(levelForXp(83_299)).toBe(49);
    expect(levelForXp(83_300)).toBe(50);
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
    expect(levelProgress(730)).toMatchObject({ level: 2, xpIntoLevel: 230, xpToNext: 320, max: false });
    expect(levelProgress(83_300)).toMatchObject({ level: 50, xpIntoLevel: 0, xpToNext: null, max: true });
    expect(levelProgress(90_000)).toMatchObject({ level: 50, xpIntoLevel: 6700, xpToNext: null, max: true });
  });
});

describe('quest reward', () => {
  it('is the same at every level: 100 / 300 / 500 / 1200 with a green run (V = 1)', () => {
    expect(questReward('easy', 1)).toBe(100);
    expect(questReward('medium', 1)).toBe(300);
    expect(questReward('hard', 1)).toBe(500);
    expect(questReward('epic', 1)).toBe(1200);
  });

  it('applies the 0.8 factor and never pays less than 1', () => {
    expect(questReward('medium', 0.8)).toBe(240);
    expect(questReward('easy', 0.8)).toBe(80);
    expect(questReward('easy', 0)).toBe(1);
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
    expect(awardForQuest(quest('medium', ['b', 'a', 'a']), 1, [])).toEqual({ amount: 300, findings: ['a', 'b'] });
  });

  it('pays once per finding: a quest whose findings were all paid gives nothing', () => {
    expect(awardForQuest(quest('hard', ['a']), 1, ['a', 'x'])).toEqual({ amount: 0, findings: [] });
  });

  it('pays in full when at least one finding is new and only lists the new ones', () => {
    expect(awardForQuest(quest('easy', ['a', 'b']), 1, ['a'])).toEqual({ amount: 100, findings: ['b'] });
  });

  it('pays a quest without findings (target-only quests) and pays nothing extra to mark', () => {
    expect(awardForQuest(quest('easy', []), 1, [])).toEqual({ amount: 100, findings: [] });
  });
});
