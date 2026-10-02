import type { StateDoc } from './state.js';

export type EffectKind = 'quest' | 'levelup' | 'boss_hit' | 'boss_defeated';

/** Which one-shot effects the change from `prev` to `next` deserves; nothing for the first document. */
export function effectsBetween(prev: StateDoc | null, next: StateDoc): EffectKind[] {
  if (prev === null) return [];
  const effects: EffectKind[] = [];
  if (next.quests.done > prev.quests.done) effects.push('quest');
  if (next.level > prev.level) effects.push('levelup');
  if (next.bossesActive < prev.bossesActive) effects.push('boss_defeated');
  else if (prev.boss !== null && next.boss !== null && prev.boss.id === next.boss.id && next.boss.hp < prev.boss.hp) {
    effects.push('boss_hit');
  }
  return effects;
}

export const bossRatio = (boss: { hp: number; max: number }): number =>
  boss.max <= 0 ? 0 : Math.min(1, Math.max(0, boss.hp / boss.max));

export const backgroundTier = (level: number): 0 | 1 | 2 => (level >= 30 ? 2 : level >= 10 ? 1 : 0);
