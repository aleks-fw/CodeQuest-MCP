import type { Stats } from '../types.js';
import { BASE_XP } from './xp.js';

export type ClassId = 'architect' | 'tester' | 'guardian' | 'optimizer' | 'cleaner' | 'bug-hunter';

export interface ClassDef {
  id: ClassId;
  /** The quest categories whose completed quests count for this class. */
  categories: readonly string[];
  /** The stats the class highlights. */
  stats: readonly (keyof Stats)[];
}

/** In this order equal shares are ranked (spec §2). */
export const CLASSES: readonly ClassDef[] = [
  { id: 'architect', categories: ['architecture'], stats: ['architecture', 'maintainability'] },
  { id: 'tester', categories: ['testing'], stats: ['testing'] },
  { id: 'guardian', categories: ['security', 'reliability'], stats: ['security', 'reliability'] },
  { id: 'optimizer', categories: ['performance'], stats: ['performance'] },
  { id: 'cleaner', categories: ['cleanup', 'refactoring', 'maintainability'], stats: ['cleanCode', 'techDebt'] },
  { id: 'bug-hunter', categories: ['bug'], stats: ['bugs'] },
];

/** Fewer counted quests than this: no class yet. */
export const MIN_QUESTS = 3;

export interface ClassShare {
  id: ClassId;
  /** 0..1 */
  share: number;
}

export interface PlayerClass {
  primary: ClassId;
  secondary?: ClassId;
  /** Every class with some work, the biggest first. */
  shares: ClassShare[];
  /** The stats of the primary class, then of the secondary one, without repeats. */
  stats: (keyof Stats)[];
}

/** A journal event, or one of the current cycle (it has no `seq` yet): only the type and the data matter here. */
export interface ClassEvent {
  type: string;
  data?: Record<string, unknown>;
}

const BY_CATEGORY = new Map(CLASSES.flatMap((def) => def.categories.map((category) => [category, def] as const)));

const weightOf = (difficulty: unknown): number =>
  typeof difficulty === 'string' && Object.hasOwn(BASE_XP, difficulty)
    ? BASE_XP[difficulty as keyof typeof BASE_XP]
    : 0;

/**
 * The class of a project from its completed quests (spec §2). Weights are whole numbers, so the borders of the hybrid
 * (60% of the first, 20% of the total) are compared exactly, not as fractions.
 */
export function classOf(events: readonly ClassEvent[]): PlayerClass | null {
  const weights = new Map<ClassId, number>();
  const seen = new Set<string>();
  let quests = 0;
  let total = 0;
  for (const event of events) {
    if (event.type !== 'quest_completed') continue;
    const data = event.data ?? {};
    const def = typeof data.category === 'string' ? BY_CATEGORY.get(data.category) : undefined;
    const weight = weightOf(data.difficulty);
    if (def === undefined || weight === 0) continue;
    if (typeof data.id === 'string') {
      if (seen.has(data.id)) continue;
      seen.add(data.id);
    }
    quests++;
    total += weight;
    weights.set(def.id, (weights.get(def.id) ?? 0) + weight);
  }
  if (quests < MIN_QUESTS) return null;

  const ranked = CLASSES.map((def) => ({ def, weight: weights.get(def.id) ?? 0 }))
    .filter((item) => item.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const [first, second] = ranked;
  if (first === undefined) return null;
  const hybrid = second !== undefined && second.weight * 10 >= first.weight * 6 && second.weight * 5 >= total;

  const stats = [...first.def.stats];
  if (hybrid) for (const stat of second.def.stats) if (!stats.includes(stat)) stats.push(stat);
  const player: PlayerClass = {
    primary: first.def.id,
    shares: ranked.map((item) => ({ id: item.def.id, share: item.weight / total })),
    stats,
  };
  if (hybrid) player.secondary = second.def.id;
  return player;
}
