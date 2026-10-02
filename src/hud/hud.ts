import type { PlayerClass } from '../game/classes.js';
import { hudTitle, levelProgress } from '../game/levels.js';
import { type Lang, t } from '../i18n/index.js';
import type { Stats } from '../types.js';
import { className } from './classes.js';

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

/**
 * The four-line HUD of spec §9.6; at level 50 the bar is full and says MAX. A class goes after the title and its stats
 * that the HUD shows get a star; without a class the text is the same as ever.
 */
export function formatHud(xp: number, stats: Stats, lang: Lang = 'en', playerClass: PlayerClass | null = null): string {
  const progress = levelProgress(xp);
  let bar: string;
  if (progress.max) {
    bar = `${progressBar(100)} ${t(lang, 'hud.max')} (${grouped(xp)} XP)`;
  } else {
    const size = progress.xpIntoLevel + (progress.xpToNext ?? 0);
    const percent = Math.floor((progress.xpIntoLevel / size) * 100);
    bar = `${progressBar(percent)} ${percent}% (${progress.xpIntoLevel}/${size})`;
  }
  const star = (name: keyof Stats): string => (playerClass?.stats.includes(name) ? '★' : '');
  const title = `⚔️ ${t(lang, 'hud.lvl')} ${progress.level} · ${hudTitle(progress.level, lang)}`;
  return [
    playerClass === null ? title : `${title} · ${className(playerClass, lang)}`,
    bar,
    `🧠 ${stats.architecture}${star('architecture')} 🧪 ${stats.testing}${star('testing')} 🛡️ ${stats.security}${star('security')}`,
    `⚡ ${stats.performance}${star('performance')} 🧹 ${stats.cleanCode}${star('cleanCode')} 🐛 ${stats.bugs}${star('bugs')}`,
  ].join('\n');
}
