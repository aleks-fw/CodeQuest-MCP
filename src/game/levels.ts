export const XP_PER_LEVEL = 500;
export const MAX_LEVEL = 50;

/** Titles of levels 1..50 (spec §6). The HUD shows them in capitals. */
export const TITLES: readonly string[] = [
  'Newcomer',
  'Trainee',
  'Coder',
  'Developer',
  'Practitioner',
  'Engineer',
  'Analyst',
  'Bug Hunter',
  'Tester',
  'Builder',
  'Explorer',
  'Code Cleaner',
  'Refactorer',
  'Code Guardian',
  'Systems Master',
  'Architect',
  'Designer',
  'Boss Slayer',
  'Expert',
  'Code Master',
  'Systems Thinker',
  'Chief Architect',
  'Optimizer',
  'Quality Guardian',
  'Veteran',
  'Code Wizard',
  'Systems Researcher',
  'Network Architect',
  'Legacy Slayer',
  'Senior Architect',
  'System Master',
  'Code Warrior',
  'AI Architect',
  'Code Legend',
  'Master Engineer',
  'Empire Architect',
  'Systems Engineer',
  'Code Alchemist',
  'Digital Sage',
  'Grand Architect',
  'Code Titan',
  'System Overlord',
  'Mastermind',
  'Legacy Destroyer',
  'Code Immortal',
  'Digital Master',
  'World Architect',
  'Code Champion',
  'Grandmaster',
  'LEGEND',
];

/** ⌊XP / 500⌋ + 1, at most 50. Negative or broken XP counts as 0. */
export function levelForXp(xp: number): number {
  const safe = Number.isFinite(xp) && xp > 0 ? xp : 0;
  return Math.min(MAX_LEVEL, Math.floor(safe / XP_PER_LEVEL) + 1);
}

/** Title of a level; levels outside 1..50 are clamped. */
export function titleForLevel(level: number): string {
  const index = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level))) - 1;
  return TITLES[index] ?? 'Newcomer';
}

export function hudTitle(level: number): string {
  return titleForLevel(level).toUpperCase();
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
      xpIntoLevel: Math.max(0, xp) - (MAX_LEVEL - 1) * XP_PER_LEVEL,
      xpToNext: null,
      max: true,
    };
  }
  const xpIntoLevel = Math.max(0, xp) - (level - 1) * XP_PER_LEVEL;
  return { level, title: titleForLevel(level), xpIntoLevel, xpToNext: XP_PER_LEVEL - xpIntoLevel, max: false };
}
