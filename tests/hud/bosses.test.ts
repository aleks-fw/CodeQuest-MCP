import { describe, expect, it } from 'vitest';
import type { BossesView } from '../../src/game/bosses.js';
import { bossesText, bossLine, bossName, bossPercent } from '../../src/hud/bosses.js';
import { notificationLine } from '../../src/hud/notifications.js';
import type { Lang } from '../../src/i18n/index.js';
import type { GameEvent } from '../../src/types.js';

const DEFEATED_AT = new Date(2026, 9, 3, 12, 0).toISOString();

const view = (lang: Lang, parts: Partial<BossesView> = {}): BossesView => ({
  project: { id: 'x', name: 'shop', root: '/shop' },
  lang,
  active: [],
  defeated: [],
  ...parts,
});

const ACTIVE = [
  { id: 'dark-forest', hp: 5, max: 12, spawnedAt: '', quests: 2 },
  { id: 'secret-leak', hp: 3, max: 3, spawnedAt: '', quests: 0 },
];

describe('bossesText', () => {
  it('lists the active bosses with HP, percent and related quests, then the defeated ones, in English', () => {
    const lines = bossesText(
      view('en', { active: ACTIVE, defeated: [{ id: 'graveyard', defeatedAt: DEFEATED_AT }] }),
    ).split('\n');
    expect(lines).toEqual([
      'BOSSES · shop',
      '⚔️ Dark Forest · 5/12 HP (42%) · related quests: 2',
      '   Modules without tests.',
      '⚔️ Secret Leak · 3/3 HP (100%) · related quests: 0',
      '   Secrets and .env in the repository.',
      '',
      'Defeated:',
      '🏆 Graveyard · 2026-10-03',
    ]);
  });

  it('speaks Russian when the language is Russian', () => {
    const lines = bossesText(view('ru', { active: ACTIVE })).split('\n');
    expect(lines[0]).toBe('БОССЫ · shop');
    expect(lines[1]).toBe('⚔️ Тёмный лес · 5/12 HP (42%) · связанных квестов: 2');
    expect(lines[2]).toBe('   Модули без тестов.');
  });

  it('says so when only victories are left, and when there is nothing', () => {
    const only = bossesText(view('en', { defeated: [{ id: 'graveyard', defeatedAt: DEFEATED_AT }] })).split('\n');
    expect(only).toEqual(['BOSSES · shop', 'No active bosses.', '', 'Defeated:', '🏆 Graveyard · 2026-10-03']);
    expect(bossesText(view('en'))).toBe('BOSSES · shop\nNo bosses: no clusters of problems.');
    expect(bossesText(view('ru')).split('\n')[1]).toBe('Боссов нет: скоплений проблем нет.');
  });

  it('shows an id it does not know by the id itself', () => {
    expect(bossName('from-the-future', 'en')).toBe('from-the-future');
  });
});

describe('bossPercent', () => {
  it('is a whole percent between 0 and 100', () => {
    expect(bossPercent(5, 12)).toBe(42);
    expect(bossPercent(9, 6)).toBe(100);
    expect(bossPercent(0, 6)).toBe(0);
    expect(bossPercent(3, 0)).toBe(0);
  });
});

describe('the lines of the notifications and the history', () => {
  const event = (type: 'boss_spawned' | 'boss_defeated', data: Record<string, unknown>): GameEvent => ({
    seq: 1,
    at: DEFEATED_AT,
    type,
    data,
  });

  it('word the start and the victory, in both languages', () => {
    const spawned = event('boss_spawned', { id: 'dark-forest', hp: 12 });
    expect(notificationLine(spawned, 'en')).toBe('⚔️ Boss appeared: Dark Forest · 12 HP');
    expect(notificationLine(spawned, 'ru')).toBe('⚔️ Появился босс: Тёмный лес · 12 HP');
    const defeated = event('boss_defeated', { id: 'graveyard' });
    expect(notificationLine(defeated, 'en')).toBe('🏆 Boss defeated: Graveyard');
    expect(notificationLine(defeated, 'ru')).toBe('🏆 Босс побеждён: Кладбище');
    expect(bossLine(defeated, 'en')).toBe(notificationLine(defeated, 'en'));
  });

  it('have no line for an event without an id, and show an unknown id as it is', () => {
    expect(notificationLine(event('boss_defeated', {}), 'en')).toBeNull();
    expect(notificationLine(event('boss_spawned', { id: '', hp: 5 }), 'en')).toBeNull();
    expect(notificationLine(event('boss_defeated', { id: 'zzz' }), 'en')).toBe('🏆 Boss defeated: zzz');
  });
});
