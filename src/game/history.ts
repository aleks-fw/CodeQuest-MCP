import type { Lang } from '../i18n/index.js';
import type { GameEvent, ProjectRef } from '../types.js';

export const DEFAULT_DAYS = 14;
export const MAX_DAYS = 365;

export interface HistoryEntry {
  event: GameEvent;
  /** Local time of the event, `HH:MM`. */
  time: string;
}

export interface HistoryDay {
  /** Local date, `YYYY-MM-DD`. */
  date: string;
  xp: number;
  quests: number;
  levelFrom?: number;
  levelTo?: number;
  /** Newest first. */
  entries: HistoryEntry[];
}

/** What `Engine.history` returns and the texts are drawn from. */
export interface HistoryView {
  project: ProjectRef;
  lang: Lang;
  /** The number of days asked for, after clamping. */
  period: number;
  days: HistoryDay[];
}

/** The number of days to look back: 14 by default, and always inside 1–365. */
export function clampDays(days: number | undefined): number {
  if (days === undefined || !Number.isFinite(days)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(1, Math.trunc(days)));
}

const two = (value: number): string => String(value).padStart(2, '0');
const dateKey = (date: Date): string => `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
const timeKey = (date: Date): string => `${two(date.getHours())}:${two(date.getMinutes())}`;
const amount = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** The local date (`YYYY-MM-DD`) of an ISO time; empty when the time is broken. */
export function localDateOf(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? '' : dateKey(date);
}

/**
 * The events the history tells about (spec §2). A plain `xp` event is not one: its amount is already in the
 * `quest_completed` of the same quest; only a top-up is a separate payment.
 */
export function isMilestone(event: GameEvent): boolean {
  switch (event.type) {
    case 'quest_completed':
    case 'level_up':
    case 'finding_returned':
    case 'settings_changed':
      return true;
    case 'achievement_unlocked':
    case 'boss_spawned':
    case 'boss_defeated':
      return typeof event.data.id === 'string' && event.data.id !== '';
    case 'xp':
      return typeof event.data.topUp === 'string';
    default:
      return false;
  }
}

/** Milestones of the last `days` calendar days (local time), by day, newest first, with the totals of each day. */
export function buildHistory(events: readonly GameEvent[], options: { days?: number; now: Date }): HistoryDay[] {
  const { now } = options;
  const first = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (clampDays(options.days) - 1)));
  const byDate = new Map<string, HistoryDay>();
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (!isMilestone(event)) continue;
    const when = new Date(event.at);
    if (Number.isNaN(when.getTime())) continue;
    const date = dateKey(when);
    if (date < first) continue;
    let day = byDate.get(date);
    if (day === undefined) {
      day = { date, xp: 0, quests: 0, entries: [] };
      byDate.set(date, day);
    }
    if (event.type === 'quest_completed') {
      day.xp += amount(event.data.xp);
      day.quests++;
    } else if (event.type === 'xp') {
      day.xp += amount(event.data.amount);
    } else if (event.type === 'level_up') {
      day.levelFrom ??= amount(event.data.from);
      day.levelTo = amount(event.data.to);
    }
    day.entries.unshift({ event, time: timeKey(when) });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}
