import { hudTitle } from '../game/levels.js';
import { questReward } from '../game/xp.js';
import { CATALOGS, type Lang, t, tn } from '../i18n/index.js';
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
export function describeCriterion(criterion: Criterion): string {
  const { params } = criterion;
  const files = strings(params.files);
  switch (criterion.type) {
    case 'finding_resolved':
      return typeof params.minCases === 'number'
        ? `The finding is gone and the project has at least ${params.minCases} test cases`
        : 'The findings of this quest are gone';
    case 'target_exists':
      if (typeof params.minBotHandlers === 'number') {
        return `The bot still has at least ${params.minBotHandlers} handlers`;
      }
      if (typeof params.movedLinesShare === 'number') {
        const share = Math.round(params.movedLinesShare * 100);
        return `${files.join(', ')} is at least ${share}% smaller and its lines moved into other files`;
      }
      if (strings(params.commands).length > 0) {
        return `${files.join(', ')} still has the handlers ${strings(params.commands).join(', ')}`;
      }
      return `${files.join(', ') || 'The target'} is still in place and used`;
    case 'tests_cover':
      return `Tests import ${String(params.module)} and have at least 3 test cases and 3 assertions`;
    case 'pattern_present':
      return files.length > 0
        ? `${files.join(', ')} contains the required check`
        : 'The project contains the required code';
    case 'pattern_absent':
      if (strings(params.secretKeys).length > 0) return 'The secret is nowhere in the project';
      return files.length > 0 && params.pattern === undefined
        ? `${files.join(', ')} is deleted`
        : 'The unwanted code is gone';
    case 'command_passes':
      return `${capitalize(String(params.command))} command passes`;
    case 'no_regressions':
      return 'No regressions';
  }
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
  const width = Math.max(0, ...open.map((quest) => quest.title.length));
  for (const [row, quest] of open.entries()) {
    const icon = ICONS[quest.difficulty];
    const label = difficultyLabel(lang, quest.difficulty);
    const kind = kinds[row] ?? '';
    lines.push(
      `${icon} ${quest.title.padEnd(width)}  ${label.padEnd(labelW)} · ${kind.padEnd(kindWidth)} +${rewardOf(quest, level)} XP · ${shortId(quest)}`,
    );
    const subtasks = quest.subtasks ?? [];
    subtasks.forEach((task, index) => {
      const branch = index === subtasks.length - 1 ? '└─' : '├─';
      const mark =
        task.status === 'completed' ? ' ✓' : task.status === 'obsolete' ? ` (${t(lang, 'status.obsolete')})` : '';
      lines.push(`   ${branch} ${task.title}${mark}`);
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
      title: quest.title,
      id: shortId(quest),
      difficulty: difficultyLabel(lang, quest.difficulty),
      category: categoryLabel(lang, quest.category),
      xp: rewardOf(quest, level),
    }),
    quest.description,
  ];
  if (quest.difficulty === 'epic') {
    for (const task of quest.subtasks ?? []) lines.push(`${markOf(task.status)} ${task.title} · ${shortId(task)}`);
  } else {
    quest.criteria.forEach((criterion, index) => {
      const result = results?.[index];
      const mark = result === undefined ? '□' : result.ok ? '✓' : '✗';
      const detail = result !== undefined && !result.ok ? ` — ${result.detail}` : '';
      lines.push(`${mark} ${describeCriterion(criterion)}${detail}`);
    });
  }
  if (quest.status !== 'open') {
    const xp = quest.xpAwarded === undefined ? '' : ` · +${quest.xpAwarded} XP`;
    lines.push(t(lang, 'card.status', { status: t(lang, `status.${quest.status}`), xp }));
  }
  return lines.join('\n');
}
