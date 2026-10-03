import { hudTitle, levelProgress } from '../game/levels.js';
import { type Lang, t } from '../i18n/index.js';

export const BAR_WIDTH = 14;

/** A 14-character bar for a percentage (spec §9.6). */
export function progressBar(percent: number): string {
  const filled = Math.max(0, Math.min(BAR_WIDTH, Math.round((percent / 100) * BAR_WIDTH)));
  return `${'█'.repeat(filled)}${'░'.repeat(BAR_WIDTH - filled)}`;
}

const grouped = (value: number): string => value.toLocaleString('en-US');

/** `◆ LVL 7 · ANALYST · 3,240 XP` */
export function formatMinimal(xp: number, lang: Lang = 'en'): string {
  const progress = levelProgress(xp);
  return `◆ ${t(lang, 'hud.lvl')} ${progress.level} · ${hudTitle(progress.level, lang)} · ${grouped(xp)} XP`;
}

/**
 * The two-line HUD: the level title and the XP bar; at level 50 the bar is full and says MAX. The stats and the class
 * are not in it, they have their own lists (`get_project_stats`, `get_project_state`).
 */
export function formatHud(xp: number, lang: Lang = 'en'): string {
  const progress = levelProgress(xp);
  let bar: string;
  if (progress.max) {
    bar = `${progressBar(100)} ${t(lang, 'hud.max')} (${grouped(xp)} XP)`;
  } else {
    const size = progress.xpIntoLevel + (progress.xpToNext ?? 0);
    const percent = Math.floor((progress.xpIntoLevel / size) * 100);
    bar = `${progressBar(percent)} ${percent}% (${progress.xpIntoLevel}/${size})`;
  }
  const title = `◆ ${t(lang, 'hud.lvl')} ${progress.level} · ${hudTitle(progress.level, lang)}`;
  return [title, bar].join('\n');
}
