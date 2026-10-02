import type { Lang } from '../i18n/index.js';
import type { NewEvent } from '../storage/journal.js';
import type { EventType, ProjectRef } from '../types.js';

/** A journal event, or one of the current cycle (it has no `seq` yet; only the type, time and data matter here). */
export interface JournalEvent {
  type: EventType;
  at?: string;
  data?: Record<string, unknown>;
}

/** What the conditions of the achievements are computed from (spec §3). */
export interface Counters {
  completed: number;
  /** Different categories among the completed quests. */
  categories: number;
  /** The highest level reached, from the `level_up` events. */
  maxLevel: number;
  /** Quests completed at factor 1 plus top-ups: work a green run of the project commands confirmed. */
  green: number;
  secret: number;
  hard: number;
  epic: number;
}

export interface AchievementDef {
  id: string;
  goal: number;
  value: (counters: Counters) => number;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first-quest', goal: 1, value: (c) => c.completed },
  { id: 'quests-10', goal: 10, value: (c) => c.completed },
  { id: 'quests-50', goal: 50, value: (c) => c.completed },
  { id: 'green-run', goal: 1, value: (c) => c.green },
  { id: 'level-5', goal: 5, value: (c) => c.maxLevel },
  { id: 'level-10', goal: 10, value: (c) => c.maxLevel },
  { id: 'level-25', goal: 25, value: (c) => c.maxLevel },
  { id: 'secret-keeper', goal: 1, value: (c) => c.secret },
  { id: 'hard-mode', goal: 1, value: (c) => c.hard },
  { id: 'epic-finish', goal: 1, value: (c) => c.epic },
  { id: 'jack-of-all-trades', goal: 5, value: (c) => c.categories },
];

export interface AchievementStatus {
  id: string;
  value: number;
  goal: number;
  /** The time of the first `achievement_unlocked` event of this id. */
  unlockedAt?: string;
}

/** What `Engine.achievements` returns and the texts are drawn from. */
export interface AchievementsView {
  project: ProjectRef;
  lang: Lang;
  /** One per achievement of the catalog, in the order of the catalog. */
  items: AchievementStatus[];
}

const number = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

export function counters(events: readonly JournalEvent[]): Counters {
  const result: Counters = { completed: 0, categories: 0, maxLevel: 0, green: 0, secret: 0, hard: 0, epic: 0 };
  const categories = new Set<string>();
  // A quest whose problem came back is generated again with the same id and can be completed again (for no XP): it
  // is the same quest, so each id counts once. A completion without an id (odd data) still counts.
  const seen = new Set<string>();
  for (const event of events) {
    const data = event.data ?? {};
    if (event.type === 'quest_completed') {
      if (typeof data.id === 'string') {
        if (seen.has(data.id)) continue;
        seen.add(data.id);
      }
      result.completed++;
      if (typeof data.category === 'string' && data.category !== '') categories.add(data.category);
      if (data.factor === 1) result.green++;
      if (data.template === 'remove-hardcoded-secret') result.secret++;
      if (data.difficulty === 'hard') result.hard++;
      if (data.difficulty === 'epic') result.epic++;
    } else if (event.type === 'xp') {
      if (typeof data.topUp === 'string') result.green++;
    } else if (event.type === 'level_up') {
      result.maxLevel = Math.max(result.maxLevel, number(data.to));
    }
  }
  result.categories = categories.size;
  return result;
}

/** The time of the first unlock event of each id. */
function unlockTimes(events: readonly JournalEvent[]): Map<string, string> {
  const times = new Map<string, string>();
  for (const event of events) {
    const id = event.data?.id;
    if (event.type === 'achievement_unlocked' && typeof id === 'string' && !times.has(id))
      times.set(id, event.at ?? '');
  }
  return times;
}

/** Every achievement of the catalog with its value, its goal and, if it was opened, the time. */
export function evaluate(events: readonly JournalEvent[]): AchievementStatus[] {
  const c = counters(events);
  const times = unlockTimes(events);
  return ACHIEVEMENTS.map((def) => {
    const status: AchievementStatus = { id: def.id, value: def.value(c), goal: def.goal };
    const unlockedAt = times.get(def.id);
    if (unlockedAt !== undefined) status.unlockedAt = unlockedAt;
    return status;
  });
}

/**
 * The `achievement_unlocked` events still to be written: the goal is reached and the journal has no event of that id
 * yet. Pass the journal and the events of the current cycle together; calling it again after they were written gives [].
 */
export function newlyUnlocked(events: readonly JournalEvent[], at: string): NewEvent[] {
  const c = counters(events);
  const times = unlockTimes(events);
  return ACHIEVEMENTS.filter((def) => def.value(c) >= def.goal && !times.has(def.id)).map(
    (def): NewEvent => ({ at, type: 'achievement_unlocked', data: { id: def.id } }),
  );
}
