import type { Lang } from '../i18n/index.js';
import { TITLES_EN, TITLES_RU } from '../i18n/titles.js';

/** XP from level 1 to level 2, and how much more every next level costs. */
export const FIRST_LEVEL_XP = 500;
export const LEVEL_XP_STEP = 50;
export const MAX_LEVEL = 50;

/** XP that takes a hero from `level` to the next one: 500, 550, 600, … */
export const xpForNext = (level: number): number =>
  FIRST_LEVEL_XP + LEVEL_XP_STEP * (Math.max(1, Math.floor(level)) - 1);

/** Total XP at which `level` starts: 500·(L−1) + 25·(L−1)(L−2). */
export const xpAtLevel = (level: number): number => {
  const steps = Math.max(1, Math.floor(level)) - 1;
  return FIRST_LEVEL_XP * steps + (LEVEL_XP_STEP / 2) * steps * (steps - 1);
};

/** Titles of levels 1..50 (spec §6). The HUD shows them in capitals. */
export const TITLES: readonly string[] = TITLES_EN;

/** The highest level whose start is at or below `xp`, at most 50. Negative or broken XP counts as 0. */
export function levelForXp(xp: number): number {
  const safe = Number.isFinite(xp) && xp > 0 ? xp : 0;
  let level = 1;
  while (level < MAX_LEVEL && safe >= xpAtLevel(level + 1)) level += 1;
  return level;
}

/** Title of a level; levels outside 1..50 are clamped. */
export function titleForLevel(level: number, lang: Lang = 'en'): string {
  const index = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level))) - 1;
  return (lang === 'ru' ? TITLES_RU : TITLES_EN)[index] ?? 'Newcomer';
}

export function hudTitle(level: number, lang: Lang = 'en'): string {
  return titleForLevel(level, lang).toUpperCase();
}

export interface LevelProgress {
  level: number;
  title: string;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP still needed for the next level; null at level 50 ("MAX"). */
  xpToNext: number | null;
  max: boolean;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) {
    // XP keeps growing after level 50, but the level does not.
    return {
      level,
      title: titleForLevel(level),
      xpIntoLevel: Math.max(0, xp) - xpAtLevel(MAX_LEVEL),
      xpToNext: null,
      max: true,
    };
  }
  const xpIntoLevel = Math.max(0, xp) - xpAtLevel(level);
  return { level, title: titleForLevel(level), xpIntoLevel, xpToNext: xpForNext(level) - xpIntoLevel, max: false };
}
