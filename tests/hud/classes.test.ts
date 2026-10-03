import { describe, expect, it } from 'vitest';
import { type ClassEvent, classOf } from '../../src/game/classes.js';
import { classLabel, classLine, className } from '../../src/hud/classes.js';
import { formatHud, formatMinimal } from '../../src/hud/hud.js';
import { formatState, formatStats } from '../../src/hud/report.js';
import type { Stats } from '../../src/types.js';

let counter = 0;
const q = (category: string, difficulty: string): ClassEvent => ({
  type: 'quest_completed',
  data: { category, difficulty, id: `q${++counter}` },
});

const STATS: Stats = {
  architecture: 78,
  testing: 71,
  security: 44,
  performance: 100,
  cleanCode: 14,
  reliability: 60,
  maintainability: 55,
  bugs: 0,
  techDebt: 20,
};

const tester = classOf([q('testing', 'easy'), q('testing', 'easy'), q('testing', 'easy')]);
const testArchitect = classOf([q('architecture', 'medium'), q('architecture', 'easy'), q('testing', 'hard')]);
const cleanerBug = classOf([q('cleanup', 'medium'), q('bug', 'medium'), q('cleanup', 'easy')]);

describe('the names of the classes', () => {
  it('names a single class, in both languages', () => {
    expect(tester && className(tester, 'en')).toBe('Tester');
    expect(tester && className(tester, 'ru')).toBe('Тестировщик');
    expect(classLabel('bug-hunter', 'ru')).toBe('Охотник за багами');
    expect(classLabel('guardian', 'en')).toBe('Guardian');
  });

  it('names Architect + Tester Test Architect in either order, any other pair A + B', () => {
    expect(testArchitect && className(testArchitect, 'en')).toBe('Test Architect');
    expect(testArchitect && className(testArchitect, 'ru')).toBe('Тест-архитектор');
    const reversed = classOf([q('architecture', 'hard'), q('testing', 'medium'), q('testing', 'easy')]);
    expect(reversed?.primary).toBe('architect');
    expect(reversed && className(reversed, 'en')).toBe('Test Architect');
    expect(cleanerBug && className(cleanerBug, 'en')).toBe('Cleaner + Bug Hunter');
    expect(cleanerBug && className(cleanerBug, 'ru')).toBe('Уборщик + Охотник за багами');
  });
});

describe('classLine', () => {
  it('shows the class and every share rounded to a whole percent', () => {
    expect(testArchitect && classLine(testArchitect, 'en')).toBe('Class: Test Architect (Tester 56% · Architect 44%)');
    expect(testArchitect && classLine(testArchitect, 'ru')).toBe(
      'Класс: Тест-архитектор (Тестировщик 56% · Архитектор 44%)',
    );
    expect(tester && classLine(tester, 'en')).toBe('Class: Tester (Tester 100%)');
  });
});

describe('the HUD and a class', () => {
  it('shows only the level title, not the class', () => {
    expect(formatHud(3990).split('\n')[0]).toBe('◆ LVL 7 · ANALYST');
    expect(formatHud(3990)).not.toContain('★');
    expect(formatMinimal(3990)).toBe('◆ LVL 7 · ANALYST · 3,990 XP');
  });
});

describe('the stats list and the state with a class', () => {
  it('stars every stat of the class in the list of nine', () => {
    const lines = formatStats(STATS, [], 8, 'en', testArchitect).split('\n');
    expect(lines).toContain('Architecture: 78★');
    expect(lines).toContain('Maintainability: 55★');
    expect(lines).toContain('Testing: 71★');
    expect(lines).toContain('Security: 44');
    expect(formatStats(STATS, [], 8, 'en', null)).toBe(formatStats(STATS, [], 8, 'en'));
    expect(formatStats(STATS, [], 8, 'en')).not.toContain('★');
  });

  it('puts the line of the class under the HUD in the state, and nothing without a class', () => {
    const base = {
      projectName: 'shop',
      root: '/shop',
      xp: 3990,
      stats: STATS,
      quests: [],
      level: 7,
      facts: null,
      errors: [],
      allowCommands: false,
      busy: false,
      unavailable: [],
    };
    const withClass = formatState({ ...base, playerClass: testArchitect }).split('\n');
    expect(withClass).toContain('Class: Test Architect (Tester 56% · Architect 44%)');
    const without = formatState({ ...base, playerClass: null });
    expect(without).not.toContain('Class:');
    expect(without).toBe(formatState(base));
  });
});
