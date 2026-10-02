import { describe, expect, it } from 'vitest';
import { buildHistory, type HistoryDay, type HistoryView } from '../../src/game/history.js';
import { dayHeader, historyLine, historyText } from '../../src/hud/history.js';
import type { Lang } from '../../src/i18n/index.js';
import type { EventType, GameEvent } from '../../src/types.js';

let seq = 0;
const local = (day: number, hour: number, minute = 0): string => new Date(2026, 9, day, hour, minute).toISOString();
const event = (type: EventType, at: string, data: Record<string, unknown> = {}): GameEvent => ({
  seq: ++seq,
  at,
  type,
  data,
});
const NOW = new Date(2026, 9, 2, 12, 0);

const EVENTS = [
  event('level_up', local(2, 9, 40), { from: 2, to: 3 }),
  event('quest_completed', local(2, 11, 21), { id: 'b', title: 'Remove Hardcoded Secret', xp: 76 }),
  event('xp', local(2, 11, 23), { amount: 95, quest: 'b', topUp: 'b', title: 'Remove Hardcoded Secret' }),
];

const view = (lang: Lang, events: GameEvent[] = EVENTS, period = 14): HistoryView => ({
  project: { id: 'x', name: 'shop', root: '/shop' },
  lang,
  period,
  days: buildHistory(events, { now: NOW, days: period }),
});

describe('historyText', () => {
  it('shows days with their totals and the milestones, newest first, in English', () => {
    const lines = historyText(view('en')).split('\n');
    expect(lines[0]).toBe('HISTORY · shop · last 14 days');
    expect(lines[1]).toBe('2026-10-02 · +171 XP · 1 quest · LVL 2 → 3');
    expect(lines[2]).toContain('  11:23 + 95 XP · Remove Hardcoded Secret: confirmed');
    expect(lines[3]).toBe('  11:21 ✓ Remove Hardcoded Secret · +76 XP');
    expect(lines[4]).toContain('  09:40 ');
    expect(lines[4]).toContain('LEVEL UP 2 → 3');
  });

  it('speaks Russian when the language is Russian', () => {
    const lines = historyText(view('ru')).split('\n');
    expect(lines[0]).toBe('ИСТОРИЯ · shop · за 14 дн.');
    expect(lines[1]).toBe('2026-10-02 · +171 XP · 1 квест · УР. 2 → 3');
    expect(lines[2]).toContain('подтверждено');
  });

  it('says so when there is nothing to tell', () => {
    expect(historyText(view('en', []))).toBe('HISTORY · shop · last 14 days\nNo milestones for this period.');
    expect(historyText(view('ru', [])).split('\n')[1]).toBe('За этот период вех нет.');
  });

  it('a quest from an old event without a template shows the stored title', () => {
    const old = [event('quest_completed', local(2, 10), { id: 'o', title: 'Old Quest', xp: 10 })];
    expect(historyText(view('ru', old))).toContain('✓ Old Quest · +10 XP');
  });
});

describe('dayHeader', () => {
  it('leaves out the parts that are zero', () => {
    const only = buildHistory([event('settings_changed', local(1, 8), { allowCommands: true })], { now: NOW });
    expect(dayHeader(only[0] as HistoryDay, 'en')).toBe('2026-10-01');
    const plural = buildHistory(
      [
        event('quest_completed', local(2, 8), { xp: 10 }),
        event('quest_completed', local(2, 9), { xp: 20 }),
        event('quest_completed', local(2, 10), { xp: 30 }),
      ],
      { now: NOW },
    );
    expect(dayHeader(plural[0] as HistoryDay, 'en')).toBe('2026-10-02 · +60 XP · 3 quests');
    expect(dayHeader(plural[0] as HistoryDay, 'ru')).toBe('2026-10-02 · +60 XP · 3 квеста');
  });
});

describe('historyLine', () => {
  it('words a settings change and a returned problem', () => {
    const on = event('settings_changed', local(1, 8), { allowCommands: true, commandTimeoutSec: 900 });
    expect(historyLine(on, 'en')).toBe('⚙ Project commands allowed (timeout 900s)');
    expect(historyLine(on, 'ru')).toBe('⚙ Команды проекта разрешены (таймаут 900 с)');
    const off = event('settings_changed', local(1, 9), { allowCommands: false });
    expect(historyLine(off, 'en')).toBe('⚙ Project commands not allowed');
    const back = event('finding_returned', local(1, 10), { rule: 'js/eval', file: 'calc.ts' });
    expect(historyLine(back, 'en')).toContain('js/eval');
    expect(historyLine(back, 'en')).toContain('calc.ts');
  });
});
