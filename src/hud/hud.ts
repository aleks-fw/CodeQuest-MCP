import { hudTitle, levelProgress } from '../game/levels.js';
import { type Lang, t } from '../i18n/index.js';
import type { Stats } from '../types.js';

export const BAR_WIDTH = 14;

/** A 14-character bar for a percentage (spec §9.6). */
export function progressBar(percent: number): string {
  const filled = Math.max(0, Math.min(BAR_WIDTH, Math.round((percent / 100) * BAR_WIDTH)));
  return `${'█'.repeat(filled)}${'░'.repeat(BAR_WIDTH - filled)}`;
}

const grouped = (value: number): string => value.toLocaleString('en-US');

/** `⚔️ LVL 7 · ANALYST · 3,240 XP` */
export function formatMinimal(xp: number, lang: Lang = 'en'): string {
  const progress = levelProgress(xp);
  return `⚔️ ${t(lang, 'hud.lvl')} ${progress.level} · ${hudTitle(progress.level, lang)} · ${grouped(xp)} XP`;
}

/** The four-line HUD of spec §9.6; at level 50 the bar is full and says MAX. */
export function formatHud(xp: number, stats: Stats, lang: Lang = 'en'): string {
  const progress = levelProgress(xp);
  let bar: string;
  if (progress.max) {
    bar = `${progressBar(100)} ${t(lang, 'hud.max')} (${grouped(xp)} XP)`;
  } else {
    const size = progress.xpIntoLevel + (progress.xpToNext ?? 0);
    const percent = Math.floor((progress.xpIntoLevel / size) * 100);
    bar = `${progressBar(percent)} ${percent}% (${progress.xpIntoLevel}/${size})`;
  }
  return [
    `⚔️ ${t(lang, 'hud.lvl')} ${progress.level} · ${hudTitle(progress.level, lang)}`,
    bar,
    `🧠 ${stats.architecture} 🧪 ${stats.testing} 🛡️ ${stats.security}`,
    `⚡ ${stats.performance} 🧹 ${stats.cleanCode} 🐛 ${stats.bugs}`,
  ].join('\n');
}
