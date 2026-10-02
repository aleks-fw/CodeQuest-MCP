import type { Lang } from '../i18n/index.js';
import type { NewEvent } from '../storage/journal.js';
import type { Finding, ProjectRef, Quest } from '../types.js';

export interface BossDef {
  id: string;
  /** The scanner rules whose findings make up the boss. */
  rules: readonly string[];
  /** The fight starts when this many findings of the theme are there. */
  threshold: number;
}

/** In this order the events of one call are written and the bosses listed (spec §2). */
export const BOSSES: readonly BossDef[] = [
  { id: 'dark-forest', rules: ['generic/untested-module'], threshold: 8 },
  { id: 'graveyard', rules: ['generic/unused-file'], threshold: 6 },
  { id: 'clone-army', rules: ['generic/duplicate-block'], threshold: 5 },
  { id: 'secret-leak', rules: ['generic/hardcoded-secret', 'generic/env-tracked'], threshold: 3 },
  {
    id: 'blind-spots',
    rules: ['generic/empty-catch', 'py/bare-except', 'bot/no-error-handler', 'bot/no-timeout'],
    threshold: 5,
  },
  {
    id: 'breach',
    rules: ['js/dangerous-html', 'js/eval', 'py/eval', 'shop/webhook-no-signature', 'bot/admin-no-check'],
    threshold: 4,
  },
  { id: 'todo-swamp', rules: ['generic/todo'], threshold: 10 },
];

export const MAX_DEFEATED = 10;

/** A journal event, or one of the current cycle (it has no `seq` yet): only the type, time and data matter here. */
export interface BossEventLike {
  type: string;
  at?: string;
  data?: Record<string, unknown>;
}

export interface ActiveBoss {
  id: string;
  /** The findings of the theme that are still there. */
  hp: number;
  /** The biggest HP of this fight. */
  max: number;
  spawnedAt: string;
  /** Open quests that have a finding of this boss. */
  quests: number;
}

export interface DefeatedBoss {
  id: string;
  defeatedAt: string;
}

export interface BossBoard {
  active: ActiveBoss[];
  /** Newest first, at most `MAX_DEFEATED`. */
  defeated: DefeatedBoss[];
}

/** What `Engine.bosses` returns and the texts are drawn from. */
export interface BossesView extends BossBoard {
  project: ProjectRef;
  lang: Lang;
}

const number = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const idOf = (event: BossEventLike): string => (typeof event.data?.id === 'string' ? event.data.id : '');
const themeOf = (findings: readonly Finding[], def: BossDef): Finding[] =>
  findings.filter((finding) => def.rules.includes(finding.rule));

interface Fight {
  active: boolean;
  hp: number;
  spawnedAt: string;
}

/** The last fight of each boss, from the events in the order they happened. */
function fightsOf(events: readonly BossEventLike[]): Map<string, Fight> {
  const fights = new Map<string, Fight>();
  for (const event of events) {
    const id = idOf(event);
    if (id === '') continue;
    if (event.type === 'boss_spawned') {
      fights.set(id, { active: true, hp: number(event.data?.hp), spawnedAt: event.at ?? '' });
    } else if (event.type === 'boss_defeated') {
      const last = fights.get(id);
      fights.set(id, { active: false, hp: last?.hp ?? 0, spawnedAt: last?.spawnedAt ?? '' });
    }
  }
  return fights;
}

/**
 * The events still to be written: a fight starts when there is none and the findings of the theme reach the
 * threshold; it ends when none are left. At most one event per boss; calling it again after they were written gives [].
 * Pass the journal and the events of the current cycle together. A rule that failed in this analysis found nothing
 * because it did not run, so it cannot end a fight: pass the ids of such rules in `failedRules`.
 */
export function bossEvents(
  findings: readonly Finding[],
  events: readonly BossEventLike[],
  at: string,
  failedRules: readonly string[] = [],
): NewEvent[] {
  const fights = fightsOf(events);
  const result: NewEvent[] = [];
  for (const def of BOSSES) {
    const count = themeOf(findings, def).length;
    const active = fights.get(def.id)?.active === true;
    if (!active && count >= def.threshold) result.push({ at, type: 'boss_spawned', data: { id: def.id, hp: count } });
    else if (active && count === 0 && !def.rules.some((rule) => failedRules.includes(rule))) result.push({ at, type: 'boss_defeated', data: { id: def.id } });
  }
  return result;
}

function linkedQuests(quests: readonly Quest[], ids: ReadonlySet<string>): number {
  return quests.filter(
    (quest) =>
      quest.status === 'open' &&
      [...quest.findings, ...(quest.subtasks ?? []).flatMap((task) => task.findings)].some((id) => ids.has(id)),
  ).length;
}

/** The fights that are on (with HP and related quests) and the victories, for the tool. */
export function evaluateBosses(
  findings: readonly Finding[],
  events: readonly BossEventLike[],
  quests: readonly Quest[],
): BossBoard {
  const fights = fightsOf(events);
  const active: ActiveBoss[] = [];
  for (const def of BOSSES) {
    const fight = fights.get(def.id);
    const theme = themeOf(findings, def);
    // A fight whose last finding is gone is over; it is listed once the cycle has written the victory.
    if (fight?.active !== true || theme.length === 0) continue;
    const ids = new Set(theme.map((finding) => finding.id));
    active.push({
      id: def.id,
      hp: theme.length,
      max: Math.max(fight.hp, theme.length),
      spawnedAt: fight.spawnedAt,
      quests: linkedQuests(quests, ids),
    });
  }
  const known = new Set(BOSSES.map((def) => def.id));
  const defeated = events
    .filter((event) => event.type === 'boss_defeated' && known.has(idOf(event)))
    .map((event): DefeatedBoss => ({ id: idOf(event), defeatedAt: event.at ?? '' }))
    .reverse()
    .sort((a, b) => b.defeatedAt.localeCompare(a.defeatedAt))
    .slice(0, MAX_DEFEATED);
  return { active, defeated };
}
