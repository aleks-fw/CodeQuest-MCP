import { describe, expect, it } from 'vitest';
import { buildHistory, clampDays, isMilestone } from '../../src/game/history.js';
import type { EventType, GameEvent } from '../../src/types.js';

let seq = 0;
// Local times, so the tests do not depend on the time zone of the machine.
const local = (day: number, hour: number, minute = 0): string => new Date(2026, 9, day, hour, minute).toISOString();
const event = (type: EventType, at: string, data: Record<string, unknown> = {}): GameEvent => ({
  seq: ++seq,
  at,
  type,
  data,
});
const NOW = new Date(2026, 9, 2, 12, 0);

describe('buildHistory', () => {
  it('groups milestones by day, newest first, with the totals of the day', () => {
    const events = [
      event('quest_completed', local(1, 10, 0), { id: 'a', xp: 80 }),
      event('level_up', local(2, 9, 40), { from: 2, to: 3 }),
      event('quest_completed', local(2, 11, 21), { id: 'b', xp: 76 }),
      event('xp', local(2, 11, 23), { amount: 95, quest: 'c', topUp: 'c' }),
    ];
    const days = buildHistory(events, { now: NOW });
    expect(days.map((day) => day.date)).toEqual(['2026-10-02', '2026-10-01']);
    expect(days[0]).toMatchObject({ xp: 171, quests: 1, levelFrom: 2, levelTo: 3 });
    expect(days[0]?.entries.map((entry) => entry.event.type)).toEqual(['xp', 'quest_completed', 'level_up']);
    expect(days[0]?.entries.map((entry) => entry.time)).toEqual(['11:23', '11:21', '09:40']);
    expect(days[1]).toMatchObject({ xp: 80, quests: 1 });
    expect(days[1]?.levelFrom).toBeUndefined();
  });

  it('shows only milestones: no analyses, openings, failed checks or plain xp (it is already in the completion)', () => {
    const at = local(2, 10);
    const events = [
      event('analysis', at),
      event('quest_opened', at, { id: 'a' }),
      event('quest_accepted', at, { id: 'a' }),
      event('quest_released', at, { id: 'a' }),
      event('quest_obsolete', at, { id: 'a' }),
      event('epic_progress', at, { id: 'a' }),
      event('verification_failed', at, { id: 'a' }),
      event('xp', at, { amount: 80, quest: 'a' }),
    ];
    expect(buildHistory(events, { now: NOW })).toEqual([]);
    expect(isMilestone(event('xp', at, { amount: 20, topUp: 'a' }))).toBe(true);
    expect(isMilestone(event('xp', at, { amount: 20 }))).toBe(false);
  });

  it('the window is `days` calendar days ending today', () => {
    const events = [
      event('level_up', local(2, 9), { from: 1, to: 2 }),
      event('level_up', local(1, 9), { from: 1, to: 2 }),
      event('level_up', new Date(2026, 8, 30, 9).toISOString(), { from: 1, to: 2 }),
    ];
    expect(buildHistory(events, { days: 1, now: NOW }).map((day) => day.date)).toEqual(['2026-10-02']);
    expect(buildHistory(events, { days: 2, now: NOW }).map((day) => day.date)).toEqual(['2026-10-02', '2026-10-01']);
    expect(buildHistory(events, { days: 3, now: NOW })).toHaveLength(3);
  });

  it('a minute before midnight and midnight itself fall on different days', () => {
    const events = [
      event('level_up', local(1, 23, 59), { from: 1, to: 2 }),
      event('level_up', local(2, 0, 0), { from: 2, to: 3 }),
    ];
    const days = buildHistory(events, { now: NOW });
    expect(days.map((day) => [day.date, day.levelFrom])).toEqual([
      ['2026-10-02', 2],
      ['2026-10-01', 1],
    ]);
  });

  it('skips an event with a broken date and counts wrong-typed numbers as 0', () => {
    const events = [
      event('quest_completed', 'garbage', { xp: 50 }),
      event('quest_completed', local(2, 10), { xp: 'lots' }),
      event('level_up', local(2, 11), { from: 'a', to: null }),
    ];
    const days = buildHistory(events, { now: NOW });
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ xp: 0, quests: 1 });
    expect(days[0]?.entries).toHaveLength(2);
  });

  it('a day with only a settings change is shown, with nothing to total', () => {
    const days = buildHistory([event('settings_changed', local(1, 8), { allowCommands: true })], { now: NOW });
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ date: '2026-10-01', xp: 0, quests: 0 });
    expect(days[0]?.levelFrom).toBeUndefined();
  });

  it('does not depend on the order of the input', () => {
    const events = [
      event('quest_completed', local(2, 10, 0), { xp: 10 }),
      event('quest_completed', local(2, 11, 0), { xp: 20 }),
    ];
    const reversed = [...events].reverse();
    expect(buildHistory(reversed, { now: NOW })).toEqual(buildHistory(events, { now: NOW }));
    expect(buildHistory(events, { now: NOW })[0]?.entries.map((entry) => entry.time)).toEqual(['11:00', '10:00']);
  });
});

describe('clampDays', () => {
  it('defaults to 14 and keeps the value inside 1–365', () => {
    expect(clampDays(undefined)).toBe(14);
    expect(clampDays(Number.NaN)).toBe(14);
    expect(clampDays(0)).toBe(1);
    expect(clampDays(-5)).toBe(1);
    expect(clampDays(2.9)).toBe(2);
    expect(clampDays(1000)).toBe(365);
    expect(clampDays(30)).toBe(30);
  });
});

describe('achievements in the history', () => {
  it('an unlocked achievement is a milestone of the day', () => {
    const unlocked = event('achievement_unlocked', local(2, 11), { id: 'first-quest' });
    expect(isMilestone(unlocked)).toBe(true);
    const days = buildHistory([unlocked], { now: NOW });
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ date: '2026-10-02', xp: 0, quests: 0 });
  });
});
