import { hudTitle } from '../game/levels.js';
import { type Lang, t } from '../i18n/index.js';
import type { GameEvent } from '../types.js';

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

export const statLabel = (lang: Lang, name: string): string => (name in STAT_LABELS ? t(lang, `stat.${name}`) : name);

/** One line for an event worth the user's attention; null for the rest (spec §9.6). */
export function notificationLine(event: GameEvent, lang: Lang = 'en'): string | null {
  const { data } = event;
  switch (event.type) {
    case 'quest_completed': {
      const stat = data.stat as { name?: string; from?: number; to?: number } | undefined;
      const change =
        stat?.name === undefined ? '' : ` · ${statLabel(lang, stat.name)} ${num(stat.from)} → ${num(stat.to)}`;
      return t(lang, 'notif.complete', { title: text(data.title), xp: num(data.xp), change });
    }
    case 'epic_progress':
      return t(lang, 'notif.epic', { title: text(data.title), subtask: text(data.subtask), left: num(data.left) });
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
