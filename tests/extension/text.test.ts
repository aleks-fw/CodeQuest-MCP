import { describe, expect, it } from 'vitest';
import { parseState } from '../../vscode-extension/src/shared/state.js';
import { statusBarText, statusBarTooltip, ui } from '../../vscode-extension/src/shared/text.js';

const doc = (over: Record<string, unknown> = {}) =>
  parseState({ version: 1, lang: 'en', level: 2, xp: { current: 475, forLevel: 500 }, title: 'APPRENTICE', ...over });

describe('status bar text', () => {
  it('shows level and xp, in the language of the document', () => {
    expect(statusBarText(doc(), 'ok')).toBe('⚔ LVL 2 · 475/500 XP');
    expect(statusBarText(doc({ lang: 'ru' }), 'ok')).toBe('⚔ УР. 2 · 475/500 XP');
  });
  it('shows MAX at the top level, a spinner while checking and no data without a document', () => {
    expect(statusBarText(doc({ level: 50, xp: { current: 120, forLevel: 500, max: true } }), 'ok')).toBe(
      '⚔ LVL 50 · MAX',
    );
    expect(statusBarText(doc(), 'checking')).toBe('$(sync~spin) CodeQuest: checking…');
    expect(statusBarText(null, 'nodata')).toBe('⚔ CodeQuest: no data');
  });
  it('puts title, class and boss into the tooltip, and the error when there is no document', () => {
    const tip = statusBarTooltip(
      doc({ class: { id: 'tester', name: 'Tester' }, boss: { id: 'x', name: 'Graveyard', hp: 5, max: 9 } }),
    );
    expect(tip).toContain('APPRENTICE');
    expect(tip).toContain('Tester');
    expect(tip).toContain('Graveyard');
    expect(statusBarTooltip(null, 'boom')).toContain('boom');
  });
});

describe('ui strings', () => {
  it('have the same placeholders in both languages', () => {
    const keys = ['check', 'checking', 'noProject', 'owed', 'quests', 'noQuests', 'bossHp', 'noData'] as const;
    for (const key of keys) {
      const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(placeholders(ui('ru', key, {}))).toEqual(placeholders(ui('en', key, {})));
    }
  });
  it('fills placeholders', () => {
    expect(ui('en', 'owed', { xp: 60 })).toBe('+60 XP waiting for a green run');
  });
});
