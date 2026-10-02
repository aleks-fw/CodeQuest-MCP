import { describe, expect, it } from 'vitest';
import { type AchievementsView, evaluate, type JournalEvent } from '../../src/game/achievements.js';
import { achievementLine, achievementsText, orderAchievements } from '../../src/hud/achievements.js';
import { notificationLine } from '../../src/hud/notifications.js';
import type { Lang } from '../../src/i18n/index.js';
import type { EventType, GameEvent } from '../../src/types.js';

const local = (day: number, hour: number): string => new Date(2026, 9, day, hour, 0).toISOString();
const ev = (type: EventType, at: string, data: Record<string, unknown> = {}): JournalEvent => ({ type, at, data });

const view = (lang: Lang, events: JournalEvent[]): AchievementsView => ({
  project: { id: 'x', name: 'shop', root: '/shop' },
  lang,
  items: evaluate(events),
});

const ONE = [
  ev('quest_completed', local(2, 10), { xp: 80 }),
  ev('achievement_unlocked', local(2, 11), { id: 'first-quest' }),
];

describe('achievementsText', () => {
  it('lists the earned ones with the date and the rest with their progress, in English', () => {
    const lines = achievementsText(view('en', ONE)).split('\n');
    expect(lines).toHaveLength(13);
    expect(lines[0]).toBe('ACHIEVEMENTS · shop · 1/12');
    expect(lines[1]).toBe('🏆 First Step · Close your first quest. · 2026-10-02');
    expect(lines[2]).toBe('🔒 Ten Down · Close 10 quests. · 1/10');
    expect(lines.at(-1)).toContain('🔒 Boss Slayer');
  });

  it('speaks Russian when the language is Russian', () => {
    const lines = achievementsText(view('ru', ONE)).split('\n');
    expect(lines[0]).toBe('ДОСТИЖЕНИЯ · shop · 1/12');
    expect(lines[1]).toBe('🏆 Первый шаг · Закрыть первый квест. · 2026-10-02');
    expect(lines[2]).toBe('🔒 Десяток · Закрыть 10 квестов. · 1/10');
  });

  it('shows a goal that is reached but not yet opened as full progress, not above it', () => {
    const events = Array.from({ length: 12 }, () => ev('quest_completed', local(2, 10), {}));
    expect(achievementsText(view('en', events))).toContain('🔒 Ten Down · Close 10 quests. · 10/10');
  });
});

describe('orderAchievements', () => {
  it('puts the newest earned first, then the rest in the order of the catalog', () => {
    const events = [
      ev('quest_completed', local(1, 9), {}),
      ev('achievement_unlocked', local(1, 9), { id: 'first-quest' }),
      ev('level_up', local(2, 9), { from: 4, to: 5 }),
      ev('achievement_unlocked', local(2, 9), { id: 'level-5' }),
    ];
    const order = orderAchievements(evaluate(events)).map((item) => item.id);
    expect(order.slice(0, 2)).toEqual(['level-5', 'first-quest']);
    expect(order[2]).toBe('quests-10');
    expect(order).toHaveLength(12);
  });
});

describe('the line of an unlocked achievement', () => {
  const unlocked = (id: string): GameEvent => ({
    seq: 1,
    at: local(2, 11),
    type: 'achievement_unlocked',
    data: { id },
  });

  it('is the same in the notifications, in both languages', () => {
    expect(notificationLine(unlocked('first-quest'), 'en')).toBe(
      '🏆 Achievement: First Step — Close your first quest.',
    );
    expect(notificationLine(unlocked('first-quest'), 'ru')).toBe('🏆 Достижение: Первый шаг — Закрыть первый квест.');
    expect(achievementLine('first-quest', 'en')).toBe(notificationLine(unlocked('first-quest'), 'en'));
  });

  it('has no line for an unlock event without an id', () => {
    expect(notificationLine({ seq: 1, at: local(2, 11), type: 'achievement_unlocked', data: {} }, 'en')).toBeNull();
    expect(unlocked('')).toMatchObject({ data: { id: '' } });
    expect(notificationLine(unlocked(''), 'en')).toBeNull();
  });

  it('names an id the catalog does not know by the id itself', () => {
    expect(notificationLine(unlocked('from-the-future'), 'en')).toBe('🏆 Achievement: from-the-future');
    expect(notificationLine(unlocked('from-the-future'), 'ru')).toBe('🏆 Достижение: from-the-future');
  });
});
