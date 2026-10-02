import type { BossesView } from '../game/bosses.js';
import { localDateOf } from '../game/history.js';
import { type Lang, t } from '../i18n/index.js';

/** A catalog text of a boss; undefined when the catalog has none (an id from a newer version). */
function lookup(lang: Lang, id: string, part: 'name' | 'desc'): string | undefined {
  const key = `boss.${id}.${part}`;
  const text = t(lang, key);
  return text === key ? undefined : text;
}

export const bossName = (id: string, lang: Lang): string => lookup(lang, id, 'name') ?? id;

export const bossDescription = (id: string, lang: Lang): string | undefined => lookup(lang, id, 'desc');

/** A whole percent from 0 to 100; HP above the biggest HP still shows 100%. */
export function bossPercent(hp: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((hp / max) * 100)));
}

/** The line of a started or won fight for the notifications and the history; null when the event has no id. */
export function bossLine(event: { type: string; data?: Record<string, unknown> }, lang: Lang): string | null {
  const id = event.data?.id;
  if (typeof id !== 'string' || id === '') return null;
  const name = bossName(id, lang);
  if (event.type === 'boss_spawned') {
    const hp = typeof event.data?.hp === 'number' ? event.data.hp : 0;
    return t(lang, 'notif.bossSpawned', { name, hp });
  }
  return t(lang, 'notif.bossDefeated', { name });
}

export function bossesText(view: BossesView): string {
  const { lang } = view;
  const lines = [t(lang, 'boss.title', { project: view.project.name })];
  if (view.active.length === 0 && view.defeated.length === 0) {
    lines.push(t(lang, 'boss.none'));
    return lines.join('\n');
  }
  if (view.active.length === 0) lines.push(t(lang, 'boss.noActive'));
  for (const boss of view.active) {
    const related = t(lang, 'boss.related', { n: boss.quests });
    lines.push(
      `⚔️ ${bossName(boss.id, lang)} · ${boss.hp}/${boss.max} HP (${bossPercent(boss.hp, boss.max)}%) · ${related}`,
    );
    const description = bossDescription(boss.id, lang);
    if (description !== undefined) lines.push(`   ${description}`);
  }
  if (view.defeated.length > 0) {
    lines.push('', t(lang, 'boss.defeatedHeader'));
    for (const boss of view.defeated) lines.push(`🏆 ${bossName(boss.id, lang)} · ${localDateOf(boss.defeatedAt)}`);
  }
  return lines.join('\n');
}
