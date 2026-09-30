import { hudTitle } from '../game/levels.js';
import { questDescription, questTitle } from '../game/quests/text.js';
import { questReward } from '../game/xp.js';
import { CATALOGS, type Lang, renderText, t, tn } from '../i18n/index.js';
import type { Criterion, CriterionResult, Quest } from '../types.js';

const ICONS: Record<Quest['difficulty'], string> = { easy: '🟢', medium: '🟡', hard: '🟠', epic: '🔴' };

const capitalize = (word: string): string => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

export const categoryLabel = (lang: Lang, category: string): string =>
  `category.${category}` in CATALOGS.en ? t(lang, `category.${category}`) : capitalize(category);

export const difficultyLabel = (lang: Lang, difficulty: Quest['difficulty']): string =>
  t(lang, `difficulty.${difficulty}`);

/** Width of the difficulty column: the longest label of the language. */
export const labelWidth = (lang: Lang): number =>
  Math.max(...(['easy', 'medium', 'hard', 'epic'] as const).map((d) => [...difficultyLabel(lang, d)].length));

/** The "kind" cell of a board row: the task count of an epic, the category of the rest. */
export const kindOf = (lang: Lang, quest: Pick<Quest, 'difficulty' | 'subtasks' | 'category'>): string =>
  quest.difficulty === 'epic'
    ? tn(lang, 'board.tasks', quest.subtasks?.length ?? 0)
    : categoryLabel(lang, quest.category);

/** English keeps its fixed width; other languages widen it to the longest kind so the rows still line up. */
export const kindColumnWidth = (lang: Lang, kinds: readonly string[], base: number): number =>
  lang === 'en' ? base : Math.max(base, ...kinds.map((kind) => [...kind].length));

/** The short number people type (spec §7.7). */
export const shortId = (quest: Pick<Quest, 'id'>): string => quest.id.slice(0, 5);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/** One condition in words (the card of spec §7.8). */
export function describeCriterion(criterion: Criterion, lang: Lang = 'en'): string {
  const { params } = criterion;
  const files = strings(params.files).join(', ');
  switch (criterion.type) {
    case 'finding_resolved':
      return typeof params.minCases === 'number'
        ? t(lang, 'crit.resolvedCases', { n: params.minCases })
        : t(lang, 'crit.resolved');
    case 'target_exists':
      if (typeof params.minBotHandlers === 'number') return tn(lang, 'crit.botHandlers', params.minBotHandlers);
      if (typeof params.movedLinesShare === 'number') {
        return t(lang, 'crit.moved', { files, n: Math.round(params.movedLinesShare * 100) });
      }
      if (strings(params.commands).length > 0) {
        return t(lang, 'crit.handlers', { files, list: strings(params.commands).join(', ') });
      }
      return files ? t(lang, 'crit.exists', { files }) : t(lang, 'crit.existsTarget');
    case 'tests_cover':
      return t(lang, 'crit.testsCover', { module: String(params.module) });
    case 'pattern_present':
      return files ? t(lang, 'crit.present', { files }) : t(lang, 'crit.presentProject');
    case 'pattern_absent':
      if (strings(params.secretKeys).length > 0) return t(lang, 'crit.secret');
      return files && params.pattern === undefined ? t(lang, 'crit.deleted', { files }) : t(lang, 'crit.absent');
    case 'command_passes':
      return t(lang, 'crit.command', {
        command: lang === 'en' ? capitalize(String(params.command)) : String(params.command),
      });
    case 'no_regressions':
      return t(lang, 'crit.noRegressions');
  }
}

/** The width of the title column outside English; a longer title is cut with an ellipsis. */
export const TITLE_COLUMN = 28;
export function cutTitle(title: string, lang: Lang): string {
  const chars = [...title];
  return lang === 'en' || chars.length <= TITLE_COLUMN ? title : `${chars.slice(0, TITLE_COLUMN - 1).join('')}…`;
}

/** What the quest pays at this level with a green run of the project's commands. */
export const rewardOf = (quest: Pick<Quest, 'difficulty'>, level: number): number =>
  questReward(quest.difficulty, level, 1);

/** `QUEST BOARD · shop · LVL 1 NEWCOMER` and a row per open quest, epics with their subtasks (spec §7.7). */
export function formatBoard(projectName: string, level: number, quests: readonly Quest[], lang: Lang = 'en'): string {
  const open = quests.filter((quest) => quest.status === 'open');
  const lines = [t(lang, 'board.title', { project: projectName, level, title: hudTitle(level, lang) })];
  if (open.length === 0) lines.push(t(lang, 'board.empty'));
  const labelW = labelWidth(lang);
  const kinds = open.map((quest) => kindOf(lang, quest));
  const kindWidth = kindColumnWidth(lang, kinds, 13);
  const titles = open.map((quest) => cutTitle(questTitle(quest, lang), lang));
  const width = Math.max(0, ...titles.map((title) => title.length));
  for (const [row, quest] of open.entries()) {
    const icon = ICONS[quest.difficulty];
    const label = difficultyLabel(lang, quest.difficulty);
    const kind = kinds[row] ?? '';
    lines.push(
      `${icon} ${(titles[row] ?? '').padEnd(width)}  ${label.padEnd(labelW)} · ${kind.padEnd(kindWidth)} +${rewardOf(quest, level)} XP · ${shortId(quest)}`,
    );
    const subtasks = quest.subtasks ?? [];
    subtasks.forEach((task, index) => {
      const branch = index === subtasks.length - 1 ? '└─' : '├─';
      const mark =
        task.status === 'completed' ? ' ✓' : task.status === 'obsolete' ? ` (${t(lang, 'status.obsolete')})` : '';
      lines.push(`   ${branch} ${questTitle(task, lang)}${mark}`);
    });
  }
  return lines.join('\n');
}

const markOf = (status: Quest['status']): string => (status === 'completed' ? '✓' : status === 'obsolete' ? '–' : '□');

/** The card of a quest; after a check each condition shows ✓ or ✗ with the reason (spec §7.8, §8.3). */
export function formatQuestCard(
  quest: Quest,
  level: number,
  check?: readonly CriterionResult[],
  lang: Lang = 'en',
): string {
  const results = check ?? quest.lastCheck;
  const lines = [
    t(lang, 'card.header', {
      title: questTitle(quest, lang),
      id: shortId(quest),
      difficulty: difficultyLabel(lang, quest.difficulty),
      category: categoryLabel(lang, quest.category),
      xp: rewardOf(quest, level),
    }),
    questDescription(quest, lang),
  ];
  if (quest.difficulty === 'epic') {
    for (const task of quest.subtasks ?? [])
      lines.push(`${markOf(task.status)} ${questTitle(task, lang)} · ${shortId(task)}`);
  } else {
    quest.criteria.forEach((criterion, index) => {
      const result = results?.[index];
      const mark = result === undefined ? '□' : result.ok ? '✓' : '✗';
      const detail = result !== undefined && !result.ok ? ` — ${renderText(lang, result.text, result.detail)}` : '';
      lines.push(`${mark} ${describeCriterion(criterion, lang)}${detail}`);
    });
  }
  if (quest.status !== 'open') {
    const xp = quest.xpAwarded === undefined ? '' : ` · +${quest.xpAwarded} XP`;
    lines.push(t(lang, 'card.status', { status: t(lang, `status.${quest.status}`), xp }));
  }
  return lines.join('\n');
}
