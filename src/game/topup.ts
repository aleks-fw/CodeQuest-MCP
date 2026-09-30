import type { GameEvent, Quest } from '../types.js';
import type { CommandName } from '../verification/evidence.js';

/** XP a completed quest was short of because no green run of the project's commands confirmed it (factor 0.8). */
export interface TopUp {
  quest: string;
  missing: number;
}

/**
 * The quests completed at a factor below 1 whose missing XP has not been paid yet. Worked out from the journal alone
 * (a `quest_completed` event has the XP and the factor; a paid top-up is an `xp` event with `topUp` = the quest id),
 * so nothing extra is stored and old completions count too.
 */
export function pendingTopUps(events: readonly GameEvent[]): TopUp[] {
  const paid = new Set<string>();
  for (const event of events) {
    if (event.type === 'xp' && typeof event.data.topUp === 'string') paid.add(event.data.topUp);
  }
  const result = new Map<string, TopUp>();
  for (const event of events) {
    if (event.type !== 'quest_completed') continue;
    const { id, xp, factor } = event.data;
    if (typeof id !== 'string' || typeof xp !== 'number' || typeof factor !== 'number') continue;
    if (paid.has(id) || xp <= 0 || factor <= 0 || factor >= 1) continue;
    const missing = Math.round(xp / factor) - xp;
    if (missing > 0) result.set(id, { quest: id, missing });
  }
  return [...result.values()];
}

/** The commands whose green run confirms a finished quest: those of its conditions and of all its subtasks. */
export function confirmingCommands(quest: Quest, available: Partial<Record<CommandName, string>>): CommandName[] {
  const names = new Set<CommandName>();
  const visit = (item: Quest): void => {
    for (const criterion of item.criteria) {
      if (criterion.type === 'command_passes') names.add(criterion.params.command as CommandName);
      if (criterion.type === 'no_regressions') names.add('test');
    }
    for (const task of item.subtasks ?? []) visit(task);
  };
  visit(quest);
  return [...names].filter((name) => available[name] !== undefined).sort();
}

/** True when a script that confirms the quest was edited after the quest was opened (the same rule as at completion). */
export function scriptsEdited(
  quest: Quest,
  names: readonly CommandName[],
  current: Partial<Record<CommandName, string>>,
): boolean {
  return names.some((name) => {
    const before = quest.baseline.scripts[name];
    return before !== undefined && before !== current[name];
  });
}
