import type { HistoryDay, HistoryView } from '../game/history.js';
import { type Lang, t, tn } from '../i18n/index.js';
import type { GameEvent } from '../types.js';
import { notificationLine, titleOf } from './notifications.js';

const num = (value: unknown): number => (typeof value === 'number' ? value : 0);

/** One milestone as a line of text; level-ups, top-ups and returned problems reuse the wording of the notifications. */
export function historyLine(event: GameEvent, lang: Lang): string {
  const { data } = event;
  if (event.type === 'quest_completed') {
    return t(lang, 'history.completed', { title: titleOf(data, lang), xp: num(data.xp) });
  }
  if (event.type === 'settings_changed') {
    return data.allowCommands === true
      ? t(lang, 'history.commandsOn', { sec: num(data.commandTimeoutSec) })
      : t(lang, 'history.commandsOff');
  }
  return notificationLine(event, lang) ?? '';
}

/** `2026-10-02 · +171 XP · 2 quests · LVL 2 → 3`; a part that is zero is left out. */
export function dayHeader(day: HistoryDay, lang: Lang): string {
  const parts = [day.date];
  if (day.xp > 0) parts.push(`+${day.xp} XP`);
  if (day.quests > 0) parts.push(tn(lang, 'history.quests', day.quests));
  if (day.levelFrom !== undefined && day.levelTo !== undefined) {
    parts.push(t(lang, 'history.level', { from: day.levelFrom, to: day.levelTo }));
  }
  return parts.join(' · ');
}

export function historyText(view: HistoryView): string {
  const { lang } = view;
  const head = t(lang, 'history.title', {
    project: view.project.name,
    period: tn(lang, 'history.period', view.period),
  });
  if (view.days.length === 0) return `${head}\n${t(lang, 'history.empty')}`;
  const lines = [head];
  for (const day of view.days) {
    lines.push(dayHeader(day, lang));
    for (const entry of day.entries) lines.push(`  ${entry.time} ${historyLine(entry.event, lang)}`);
  }
  return lines.join('\n');
}
