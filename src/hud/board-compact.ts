import { hudTitle, levelProgress } from '../game/levels.js';
import { distinctTitles } from '../game/quests/text.js';
import { type Lang, t } from '../i18n/index.js';
import type { Quest } from '../types.js';
import type { BoardUi } from './board-ui.js';
import { cutTitle, difficultyLabel, rewardOf } from './quests.js';

/** The board is drawn in two lines when the window has fewer rows than this (and `--compact` forces it). */
export const COMPACT_ROWS = 10;

const BAR = 10;

const grouped = (value: number): string => value.toLocaleString('en-US');

const cut = (text: string, width: number): string => {
  const chars = [...text];
  return chars.length <= width ? text : `${chars.slice(0, Math.max(0, width - 1)).join('')}…`;
};

export interface CompactOptions {
  xp: number;
  width: number;
  lang: Lang;
}

/** `◆ LVL 7 · 240/500 XP ███░░░░░░░ · 8 open`: where the hero stands, in one line. */
function statusLine(open: number, { xp, width, lang }: CompactOptions): string {
  const progress = levelProgress(xp);
  const size = progress.xpIntoLevel + (progress.xpToNext ?? 0);
  const filled = progress.max ? BAR : Math.round((progress.xpIntoLevel / size) * BAR);
  const bar = `${'█'.repeat(filled)}${'░'.repeat(BAR - filled)}`;
  const amount = progress.max ? `${grouped(xp)} XP` : `${progress.xpIntoLevel}/${size} XP`;
  return cut(
    `◆ ${t(lang, 'hud.lvl')} ${progress.level} · ${hudTitle(progress.level, lang)} · ${amount} ${bar} · ${t(lang, 'compact.open', { n: open })}`,
    width,
  );
}

/**
 * The two-line board for a small panel. Line 1 is the status, line 2 is the message if there is one, otherwise the
 * quest under the cursor (or the open card with its keys). The keys are the same as on the full board.
 */
export function renderCompact(quests: readonly Quest[], ui: BoardUi, options: CompactOptions): string[] {
  const { lang, width } = options;
  const first = statusLine(quests.length, options);
  if (ui.message !== undefined) return [first, cut(ui.message.split('\n')[0] ?? '', width)];
  if (quests.length === 0) return [first, cut(t(lang, 'board.empty'), width)];
  const quest =
    (ui.mode === 'card' && ui.questId !== undefined ? quests.find((item) => item.id === ui.questId) : undefined) ??
    quests[Math.min(ui.index, quests.length - 1)];
  if (quest === undefined) return [first];
  const title = cutTitle(distinctTitles(quests, lang)[quests.indexOf(quest)] ?? quest.title, lang);
  const reward = `${difficultyLabel(lang, quest.difficulty)} +${rewardOf(quest)} XP`;
  if (ui.mode === 'card') {
    const hint = quest.acceptedAt === undefined ? t(lang, 'ui.cardTake') : t(lang, 'ui.cardTaken');
    return [first, cut(`${title} · ${reward} · ${hint}`, width)];
  }
  const mark = quest.acceptedAt === undefined ? '▶' : '●';
  return [first, cut(`${mark} ${title} · ${reward} · ${t(lang, 'compact.hint')}`, width)];
}
