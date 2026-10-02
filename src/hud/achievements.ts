import type { AchievementStatus, AchievementsView } from '../game/achievements.js';
import { localDateOf } from '../game/history.js';
import { type Lang, t } from '../i18n/index.js';

/** A catalog text of an achievement; undefined when the catalog has none (an id from a newer version). */
function lookup(lang: Lang, id: string, part: 'name' | 'desc'): string | undefined {
  const key = `achievement.${id}.${part}`;
  const text = t(lang, key);
  return text === key ? undefined : text;
}

export const achievementName = (id: string, lang: Lang): string => lookup(lang, id, 'name') ?? id;

export const achievementDescription = (id: string, lang: Lang): string | undefined => lookup(lang, id, 'desc');

/** The line of a newly opened achievement for the notifications and the history. */
export function achievementLine(id: string, lang: Lang): string {
  const name = achievementName(id, lang);
  const description = achievementDescription(id, lang);
  return description === undefined
    ? t(lang, 'notif.achievementPlain', { name })
    : t(lang, 'notif.achievement', { name, description });
}

const unlockedAt = (item: AchievementStatus): string => item.unlockedAt ?? '';

/** The earned ones, the newest first, then the rest in the order they came in (the order of the catalog). */
export function orderAchievements(items: readonly AchievementStatus[]): AchievementStatus[] {
  const earned = items.filter((item) => item.unlockedAt !== undefined);
  earned.sort((a, b) => unlockedAt(b).localeCompare(unlockedAt(a)));
  return [...earned, ...items.filter((item) => item.unlockedAt === undefined)];
}

export function achievementsText(view: AchievementsView): string {
  const { lang } = view;
  const ordered = orderAchievements(view.items);
  const done = ordered.filter((item) => item.unlockedAt !== undefined).length;
  const lines = [t(lang, 'achievements.title', { project: view.project.name, done, total: ordered.length })];
  for (const item of ordered) {
    const name = achievementName(item.id, lang);
    const description = achievementDescription(item.id, lang) ?? '';
    lines.push(
      item.unlockedAt === undefined
        ? `🔒 ${name} · ${description} · ${Math.min(item.value, item.goal)}/${item.goal}`
        : `🏆 ${name} · ${description} · ${localDateOf(item.unlockedAt)}`,
    );
  }
  return lines.join('\n');
}
