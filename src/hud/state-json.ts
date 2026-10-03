import type { ProjectView } from '../engine/index.js';
import type { BossesView } from '../game/bosses.js';
import { hudTitle, levelProgress, xpForNext } from '../game/levels.js';
import { questTitle } from '../game/quests/text.js';
import type { Lang } from '../i18n/index.js';
import type { Stats } from '../types.js';
import { bossName } from './bosses.js';

export const STATE_VERSION = 1;
export const MAX_IN_PROGRESS = 5;

/** What `state --json` and `verify --json` print: everything the VS Code panel shows (spec of the panel §3). */
export interface StateDocument {
  version: typeof STATE_VERSION;
  lang: Lang;
  project: { name: string; path: string };
  level: number;
  xp: { current: number; forLevel: number; max: boolean };
  title: string;
  stats: Stats;
  /** A verification is running: this is the last saved state. */
  busy: boolean;
  owed: { count: number; xp: number };
  quests: { open: number; done: number; inProgress: { id: string; title: string; difficulty: string }[] };
  /** The first active boss in the order of the registry. */
  boss: { id: string; name: string; hp: number; max: number } | null;
  bossesActive: number;
}

export function buildStateDocument(view: ProjectView, bosses: BossesView): StateDocument {
  const { lang, state } = view;
  const progress = levelProgress(state.xp);
  const first = bosses.active[0];
  const open = state.quests.filter((quest) => quest.status === 'open');
  return {
    version: STATE_VERSION,
    lang,
    project: { name: view.project.name, path: view.project.root },
    level: progress.level,
    xp: { current: progress.xpIntoLevel, forLevel: xpForNext(progress.level), max: progress.max },
    title: hudTitle(progress.level, lang),
    stats: state.stats,
    busy: view.busy,
    owed: { count: view.owed.count, xp: view.owed.xp },
    quests: {
      open: open.length,
      done: state.quests.filter((quest) => quest.status === 'completed').length,
      inProgress: open
        .filter((quest) => quest.acceptedAt !== undefined)
        .slice(0, MAX_IN_PROGRESS)
        .map((quest) => ({ id: quest.id, title: questTitle(quest, lang), difficulty: quest.difficulty })),
    },
    boss: first === undefined ? null : { id: first.id, name: bossName(first.id, lang), hp: first.hp, max: first.max },
    bossesActive: bosses.active.length,
  };
}
