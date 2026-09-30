import { questDescription, questTitle } from '../game/quests/text.js';
import { type Lang, t } from '../i18n/index.js';
import type { Quest } from '../types.js';
import { cutTitle, difficultyLabel, formatQuestCard, kindColumnWidth, kindOf, labelWidth, rewardOf } from './quests.js';

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
    case 'K':
    case 'л':
    case 'Л':
      return 'up';
    case '\u001b[B':
    case 'j':
    case 'J':
    case 'о':
    case 'О':
      return 'down';
    case '\r':
    case '\n':
      return 'enter';
    case '\u001b':
      return 'esc';
    case 'v':
    case 'V':
    case 'м':
    case 'М':
      return 'verify';
    case 'r':
    case 'R':
    case 'к':
    case 'К':
      return 'refresh';
    case 'l':
    case 'L':
    case 'д':
    case 'Д':
      return 'language';
    case 'q':
    case 'Q':
    case 'й':
    case 'Й':
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

/** Words onto lines of at most `width` characters; a word longer than a line is cut. */
function wrapWords(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line === '' ? word : `${line} ${word}`;
    if ([...next].length <= width) {
      line = next;
    } else {
      if (line !== '') lines.push(line);
      line = [...word].length > width ? truncate(word, width) : word;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** A hint line broken at its " · " separators, so no hint is ever cut off. */
function wrapHints(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const part of text.split(' · ')) {
    const next = line === '' ? part : `${line} · ${part}`;
    if (line === '' || [...next].length <= width) {
      line = next;
    } else {
      lines.push(line);
      line = part;
    }
  }
  if (line !== '') lines.push(line);
  return lines.map((item) => truncate(item, width));
}

/** At most two lines of description; more is cut with an ellipsis. */
function describeLines(text: string, width: number): string[] {
  const lines = wrapWords(text, width);
  if (lines.length <= 2) return lines;
  return [lines[0] ?? '', truncate(`${lines[1] ?? ''} ${lines.slice(2).join(' ')}`, width)];
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
  const labelW = labelWidth(lang);
  const kinds = quests.map((quest) => kindOf(lang, quest));
  const kindWidth = kindColumnWidth(lang, kinds, 10);
  const titles = quests.map((quest) => cutTitle(questTitle(quest, lang), lang));
  const naturalWidth = Math.min(28, Math.max(0, ...titles.map((title) => [...title].length)));
  let titleWidth = naturalWidth;
  const rowOf = (quest: Quest, index: number, withKind: boolean, titleW: number): string => {
    const kind = kinds[index] ?? '';
    const taken = quest.acceptedAt === undefined ? '' : `  ${t(lang, 'ui.inProgress')}`;
    const label = difficultyLabel(lang, quest.difficulty).padEnd(labelW);
    // Titles are only cut when the screen forced the column narrower than it normally is.
    const full = titles[index] ?? '';
    const title = (titleW < naturalWidth ? truncate(full, titleW) : full).padEnd(titleW);
    return `${index === ui.index ? '▶' : ' '} ${ICON[quest.difficulty]} ${title}  ${label}${withKind ? ` · ${kind.padEnd(kindWidth)}` : ''} +${rewardOf(quest, level)} XP${taken}`;
  };
  // The layout is chosen once for all rows, so the columns stay aligned. The emoji takes two cells, hence one spare
  // column. On a narrow screen the kind column goes first, then the titles are shortened: the reward and the
  // IN PROGRESS mark at the end always stay visible.
  const limit = Math.max(20, width - 1);
  const widest = (withKind: boolean): number =>
    Math.max(0, ...quests.map((quest, index) => [...rowOf(quest, index, withKind, titleWidth)].length));
  const withKind = widest(true) <= limit;
  if (!withKind && widest(false) > limit) titleWidth = Math.max(8, titleWidth - (widest(false) - limit));
  quests.forEach((quest, index) => {
    const here = index === ui.index;
    const head = rowOf(quest, index, withKind, titleWidth);
    const code = quest.acceptedAt !== undefined ? '1;33' : here ? '1;36' : '';
    lines.push(code === '' ? head : paint(color, code, head));
    for (const part of describeLines(questDescription(quest, lang), Math.max(10, width - 5))) {
      lines.push(paint(color, '2', `     ${part}`));
    }
  });
  lines.push('');
  if (ui.message !== undefined) lines.push(ui.message);
  for (const part of wrapHints(t(lang, 'ui.help'), width)) lines.push(paint(color, '2', part));
  return lines.join('\n');
}

/** The full card; `detail` replaces the standard card text when the caller has more to say (the "Where" lines). */
export function renderCard(
  quest: Quest,
  options: { level: number; color: boolean; detail?: string; lang?: Lang; width?: number },
): string {
  const lang = options.lang ?? 'en';
  const hints = (text: string): string[] => (options.width === undefined ? [text] : wrapHints(text, options.width));
  const lines = [options.detail ?? formatQuestCard(quest, options.level, undefined, lang), ''];
  if (quest.acceptedAt !== undefined) {
    lines.push(paint(options.color, '1;33', t(lang, 'ui.inProgress')), ...hints(t(lang, 'ui.cardTaken')));
  } else {
    lines.push(...hints(t(lang, 'ui.cardTake')));
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
