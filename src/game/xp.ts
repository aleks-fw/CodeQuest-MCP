import type { Quest } from '../types.js';

export const BASE_XP: Record<Quest['difficulty'], number> = { easy: 100, medium: 300, hard: 500, epic: 1200 };

/** Factor when the quest was not confirmed by a green run of the project's own commands. */
export const UNVERIFIED_FACTOR = 0.8;

export interface VerificationState {
  /** At least one project command has run. */
  ranAnyCommand: boolean;
  /** Every applicable command's last run is green. */
  allGreen: boolean;
  /** The scripts that define the commands are the same as when the quest was opened. */
  scriptsUnchanged: boolean;
}

/** V = 1.0 only when a command ran, all applicable ones are green and the scripts were not edited. */
export function verificationFactor(state: VerificationState): number {
  return state.ranAnyCommand && state.allGreen && state.scriptsUnchanged ? 1 : UNVERIFIED_FACTOR;
}

/** round(base × V), at least 1: the reward does not depend on the level. */
export function questReward(difficulty: Quest['difficulty'], factor: number): number {
  return Math.max(1, Math.round(BASE_XP[difficulty] * factor));
}

export interface Award {
  /** XP to add; 0 when every finding of the quest was already paid. */
  amount: number;
  /** Finding ids to add to the paid list. */
  findings: string[];
}

/**
 * XP for a completed quest. Each finding is paid once, so a quest whose findings were all paid before gives nothing.
 * Subtasks of an epic give no XP; the caller awards the epic only.
 */
export function awardForQuest(quest: Quest, factor: number, paid: readonly string[]): Award {
  const already = new Set(paid);
  const fresh = quest.findings.filter((id) => !already.has(id));
  if (quest.findings.length > 0 && fresh.length === 0) return { amount: 0, findings: [] };
  return { amount: questReward(quest.difficulty, factor), findings: [...new Set(fresh)].sort() };
}
