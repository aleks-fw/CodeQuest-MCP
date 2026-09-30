import { type Lang, t, tn } from '../i18n/index.js';
import type { Quest } from '../types.js';
import { categoryLabel, difficultyLabel, formatQuestCard, rewardOf } from './quests.js';

/** What the interactive board shows and remembers between key presses. */
export interface BoardUi {
  mode: 'list' | 'card';
  index: number;
  /** The quest of the open card, so the card stays put when the list changes under it. */
  questId?: string;
  message?: string;
}

export type Key = 'up' | 'down' | 'enter' | 'esc' | 'verify' | 'refresh' | 'language' | 'quit';

export type BoardAction =
  | { type: 'accept'; quest: string }
  | { type: 'verify'; quest: string }
  | { type: 'refresh' }
  | { type: 'language' }
  | { type: 'quit' };

export interface RenderOptions {
  level: number;
  width: number;
  color: boolean;
  lang?: Lang;
}

/** Terminal input (a raw chunk) → a key; null for anything the board does not use. */
export function parseKey(input: string): Key | null {
  switch (input) {
    case '\u001b[A':
    case 'k':
      return 'up';
    case '\u001b[B':
    case 'j':
      return 'down';
    case '\r':
    case '\n':
      return 'enter';
    case '\u001b':
      return 'esc';
    case 'v':
    case 'V':
      return 'verify';
    case 'r':
    case 'R':
      return 'refresh';
    case 'l':
    case 'L':
      return 'language';
    case 'q':
    case 'Q':
    case '\u0003':
      return 'quit';
    default:
      return null;
  }
}

const ICON: Record<Quest['difficulty'], string> = { easy: '🟢', medium: '🟡', hard: '🟠', epic: '🔴' };
/** Cut to `width` characters, ending with an ellipsis. */
function truncate(text: string, width: number): string {
  const chars = [...text];
  return chars.length <= width ? text : `${chars.slice(0, Math.max(0, width - 1)).join('')}…`;
}

const paint = (on: boolean, code: string, text: string): string => (on ? `\u001b[${code}m${text}\u001b[0m` : text);

const selected = (ui: BoardUi, quests: readonly Quest[]): Quest | undefined =>
  (ui.questId === undefined ? undefined : quests.find((quest) => quest.id === ui.questId)) ?? quests[ui.index];

/** Rows of open quests with a one-line description each; the cursor row and the taken quests stand out. */
export function renderList(quests: readonly Quest[], ui: BoardUi, options: RenderOptions): string {
  const { level, width, color } = options;
  const lang = options.lang ?? 'en';
  const lines: string[] = [];
  if (quests.length === 0) lines.push(t(lang, 'board.empty'));
  const labelWidth = Math.max(
    ...(['easy', 'medium', 'hard', 'epic'] as const).map((d) => [...difficultyLabel(lang, d)].length),
  );
  const titleWidth = Math.min(28, Math.max(0, ...quests.map((quest) => [...quest.title].length)));
  quests.forEach((quest, index) => {
    const here = index === ui.index;
    const kind =
      quest.difficulty === 'epic'
        ? tn(lang, 'board.tasks', quest.subtasks?.length ?? 0)
        : categoryLabel(lang, quest.category);
    const taken = quest.acceptedAt === undefined ? '' : `  ${t(lang, 'ui.inProgress')}`;
    const head = truncate(
      `${here ? '▶' : ' '} ${ICON[quest.difficulty]} ${quest.title.padEnd(titleWidth)}  ${difficultyLabel(lang, quest.difficulty).padEnd(labelWidth)} · ${kind.padEnd(10)} +${rewardOf(quest, level)} XP${taken}`,
      width,
    );
    const code = quest.acceptedAt !== undefined ? '1;33' : here ? '1;36' : '';
    lines.push(code === '' ? head : paint(color, code, head));
    lines.push(paint(color, '2', `     ${truncate(quest.description, Math.max(10, width - 5))}`));
  });
  lines.push('');
  if (ui.message !== undefined) lines.push(ui.message);
  lines.push(paint(color, '2', truncate(t(lang, 'ui.help'), width)));
  return lines.join('\n');
}

/** The full card; `detail` replaces the standard card text when the caller has more to say (the "Where" lines). */
export function renderCard(
  quest: Quest,
  options: { level: number; color: boolean; detail?: string; lang?: Lang },
): string {
  const lang = options.lang ?? 'en';
  const lines = [options.detail ?? formatQuestCard(quest, options.level, undefined, lang), ''];
  if (quest.acceptedAt !== undefined) {
    lines.push(paint(options.color, '1;33', t(lang, 'ui.inProgress')), t(lang, 'ui.cardTaken'));
  } else {
    lines.push(t(lang, 'ui.cardTake'));
  }
  return lines.join('\n');
}

/** One key press: the next screen state and, when the key asks for work, what to do. */
export function step(ui: BoardUi, key: Key, quests: readonly Quest[]): { ui: BoardUi; action?: BoardAction } {
  const base: BoardUi = {
    mode: ui.mode,
    index: ui.index,
    ...(ui.questId === undefined ? {} : { questId: ui.questId }),
  };
  if (key === 'quit') return { ui: base, action: { type: 'quit' } };
  if (key === 'refresh') return { ui: base, action: { type: 'refresh' } };
  if (key === 'language') return { ui: base, action: { type: 'language' } };
  const current = selected(ui, quests);
  if (ui.mode === 'list') {
    if (key === 'up') return { ui: { ...base, index: Math.max(0, ui.index - 1) } };
    if (key === 'down') return { ui: { ...base, index: Math.min(Math.max(0, quests.length - 1), ui.index + 1) } };
    if (current === undefined) return { ui: base };
    if (key === 'enter') return { ui: { mode: 'card', index: ui.index, questId: current.id } };
    if (key === 'verify') return { ui: base, action: { type: 'verify', quest: current.id } };
    return { ui: base };
  }
  if (key === 'esc') return { ui: { mode: 'list', index: ui.index } };
  if (current === undefined) return { ui: { mode: 'list', index: ui.index } };
  if (key === 'verify') return { ui: base, action: { type: 'verify', quest: current.id } };
  if (key === 'enter' && current.acceptedAt === undefined) {
    return { ui: base, action: { type: 'accept', quest: current.id } };
  }
  return { ui: base };
}

/** After the list changed under the screen: keep the cursor inside it, and drop a card whose quest is gone. */
export function reconcile(ui: BoardUi, quests: readonly Quest[]): BoardUi {
  const index = Math.min(ui.index, Math.max(0, quests.length - 1));
  const message = ui.message === undefined ? {} : { message: ui.message };
  if (ui.mode === 'card') {
    const found = selected(ui, quests);
    if (found === undefined || (ui.questId !== undefined && found.id !== ui.questId)) {
      return { mode: 'list', index, ...message };
    }
    return { ...ui, index: quests.indexOf(found) };
  }
  return { mode: 'list', index, ...message };
}
