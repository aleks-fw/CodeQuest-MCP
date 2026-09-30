import { hudTitle } from '../game/levels.js';
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

/** One line for an event worth the user's attention; null for the rest (spec §9.6). */
export function notificationLine(event: GameEvent): string | null {
  const { data } = event;
  switch (event.type) {
    case 'quest_completed': {
      const stat = data.stat as { name?: string; from?: number; to?: number } | undefined;
      const change =
        stat?.name === undefined ? '' : ` · ${STAT_LABELS[stat.name] ?? stat.name} ${num(stat.from)} → ${num(stat.to)}`;
      return `✓ ${text(data.title)} complete · +${num(data.xp)} XP${change}`;
    }
    case 'epic_progress':
      return `◐ ${text(data.title)}: ${text(data.subtask)} done · ${num(data.left)} left`;
    case 'level_up':
      return `⚔️ LEVEL UP ${num(data.from)} → ${num(data.to)} · ${hudTitle(num(data.to))}`;
    case 'finding_returned':
      return `↩ A fixed problem is back: ${text(data.rule)}${text(data.file) === '' ? '' : ` in ${text(data.file)}`}`;
    case 'analysis': {
      const stats = (data.stats ?? {}) as Record<string, [number, number]>;
      const parts = Object.entries(stats).map(([name, pair]) => `${STAT_LABELS[name] ?? name} ${pair[0]} → ${pair[1]}`);
      return parts.length === 0 ? null : `📈 ${parts.join(', ')}`;
    }
    default:
      return null;
  }
}

/** At most 5 lines; the rest becomes "+N more" (spec §9.6). */
export function notificationLines(events: readonly GameEvent[]): string[] {
  const lines = events.flatMap((event) => notificationLine(event) ?? []);
  if (lines.length <= MAX_NOTIFICATION_LINES) return lines;
  const keep = MAX_NOTIFICATION_LINES - 1;
  return [...lines.slice(0, keep), `+${lines.length - keep} more`];
}
