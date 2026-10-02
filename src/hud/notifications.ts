import { hudTitle } from '../game/levels.js';
import { questTitle, type TextVars } from '../game/quests/text.js';
import { type Lang, t } from '../i18n/index.js';
import type { GameEvent, Quest } from '../types.js';
import { achievementLine } from './achievements.js';

export const MAX_NOTIFICATION_LINES = 5;

export const STAT_LABELS: Record<string, string> = {
  architecture: 'Architecture',
  testing: 'Testing',
  security: 'Security',
  performance: 'Performance',
  cleanCode: 'Clean Code',
  reliability: 'Reliability',
  maintainability: 'Maintainability',
  bugs: 'Bugs',
  techDebt: 'Tech Debt',
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => (typeof value === 'number' ? value : 0);

export const statLabel = (lang: Lang, name: string): string =>
  Object.hasOwn(STAT_LABELS, name) ? t(lang, `stat.${name}`) : name;

/**
 * The title of a quest an event is about, in the language: rendered from `template` and `vars` when the event has them,
 * else the stored text (events written before the language switch keep working). `prefix` picks the epic's or the
 * subtask's pair (`epic`, `subtask`); the stored text of those lives in `data[prefix]` or `data.title`.
 */
export function titleOf(data: GameEvent['data'], lang: Lang, prefix?: 'epic' | 'subtask'): string {
  const key = (name: string): string =>
    prefix === undefined ? name : `${prefix}${name[0]?.toUpperCase()}${name.slice(1)}`;
  const stored = text(prefix === 'subtask' ? data.subtask : prefix === 'epic' ? data.epic : data.title);
  const template = data[key('template')];
  if (typeof template !== 'string') return stored;
  const raw = data[key('vars')];
  const vars = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as TextVars) : undefined;
  return questTitle({ template, title: stored, description: '', ...(vars ? { vars } : {}) } as Quest, lang);
}

/** One line for an event worth the user's attention; null for the rest (spec §9.6). */
export function notificationLine(event: GameEvent, lang: Lang = 'en'): string | null {
  const { data } = event;
  switch (event.type) {
    case 'quest_completed': {
      const stat = data.stat as { name?: string; from?: number; to?: number } | undefined;
      const change =
        stat?.name === undefined ? '' : ` · ${statLabel(lang, stat.name)} ${num(stat.from)} → ${num(stat.to)}`;
      return t(lang, 'notif.complete', { title: titleOf(data, lang), xp: num(data.xp), change });
    }
    case 'xp':
      return data.topUp === undefined
        ? null
        : t(lang, 'notif.topup', { title: titleOf(data, lang), xp: num(data.amount) });
    case 'epic_progress':
      return t(lang, 'notif.epic', {
        title: titleOf(data, lang),
        subtask: titleOf(data, lang, 'subtask'),
        left: num(data.left),
      });
    case 'level_up':
      return t(lang, 'notif.levelup', { from: num(data.from), to: num(data.to), title: hudTitle(num(data.to), lang) });
    case 'finding_returned':
      return (
        t(lang, 'notif.returned', { rule: text(data.rule) }) +
        (text(data.file) === '' ? '' : t(lang, 'notif.returnedIn', { file: text(data.file) }))
      );
    case 'analysis': {
      const stats = (data.stats ?? {}) as Record<string, [number, number]>;
      const parts = Object.entries(stats).map(([name, pair]) => `${statLabel(lang, name)} ${pair[0]} → ${pair[1]}`);
      return parts.length === 0 ? null : `📈 ${parts.join(', ')}`;
    }
    case 'achievement_unlocked':
      return text(data.id) === '' ? null : achievementLine(text(data.id), lang);
    default:
      return null;
  }
}

/** At most 5 lines; the rest becomes "+N more" (spec §9.6). */
export function notificationLines(events: readonly GameEvent[], lang: Lang = 'en'): string[] {
  const lines = events.flatMap((event) => notificationLine(event, lang) ?? []);
  if (lines.length <= MAX_NOTIFICATION_LINES) return lines;
  const keep = MAX_NOTIFICATION_LINES - 1;
  return [...lines.slice(0, keep), t(lang, 'notif.more', { n: lines.length - keep })];
}
