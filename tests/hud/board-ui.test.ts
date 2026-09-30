import { describe, expect, it } from 'vitest';
import { type BoardUi, parseKey, reconcile, renderCard, renderList, step } from '../../src/hud/board-ui.js';
import type { Quest } from '../../src/types.js';

function quest(id: string, overrides: Partial<Quest> = {}): Quest {
  return {
    id,
    template: 't',
    pack: 'shop',
    title: `Quest ${id}`,
    description: `Description of quest ${id} that is rather long and goes on and on and on and on and on and on.`,
    category: 'cleanup',
    difficulty: 'easy',
    findings: ['f'],
    criteria: [{ type: 'no_regressions', params: {} }],
    status: 'open',
    createdAt: '',
    baseline: {
      head: null,
      takenAt: '',
      findings: [],
      highFindings: [],
      testCasesTotal: 0,
      testCasesByModule: {},
      codeLines: 0,
      fileLines: {},
      botHandlers: 0,
      scripts: {},
    },
    ...overrides,
  };
}

const QUESTS = [quest('aaaaa1'), quest('bbbbb2'), quest('ccccc3', { acceptedAt: '2026-09-30T10:00:00Z' })];
const LIST: BoardUi = { mode: 'list', index: 0 };

describe('parseKey', () => {
  it('maps terminal input to keys', () => {
    expect(parseKey('\u001b[A')).toBe('up');
    expect(parseKey('\u001b[B')).toBe('down');
    expect(parseKey('k')).toBe('up');
    expect(parseKey('j')).toBe('down');
    expect(parseKey('\r')).toBe('enter');
    expect(parseKey('\u001b')).toBe('esc');
    expect(parseKey('v')).toBe('verify');
    expect(parseKey('V')).toBe('verify');
    expect(parseKey('r')).toBe('refresh');
    expect(parseKey('q')).toBe('quit');
    expect(parseKey('\u0003')).toBe('quit');
    expect(parseKey('x')).toBeNull();
  });
});

describe('renderList', () => {
  it('shows a row and a short description for every open quest, cursor on the selected one', () => {
    const text = renderList(QUESTS, LIST, { level: 1, width: 60, color: false });
    const lines = text.split('\n');
    expect(lines.some((line) => line.startsWith('▶') && line.includes('Quest aaaaa1'))).toBe(true);
    expect(text).toContain('Quest bbbbb2');
    expect(text).toContain('Description of quest aaaaa1');
    expect(lines.every((line) => [...line].length <= 60)).toBe(true);
  });

  it('marks a quest taken to work', () => {
    const text = renderList(QUESTS, LIST, { level: 1, width: 80, color: false });
    const row = text.split('\n').find((line) => line.includes('Quest ccccc3'));
    expect(row).toContain('IN PROGRESS');
    expect(text.split('\n').find((line) => line.includes('Quest aaaaa1'))).not.toContain('IN PROGRESS');
  });

  it('glows a taken quest with colour only when colour is on', () => {
    expect(renderList(QUESTS, LIST, { level: 1, width: 80, color: false })).not.toContain('\u001b[');
    expect(renderList(QUESTS, LIST, { level: 1, width: 80, color: true })).toContain('\u001b[');
  });

  it('says so when there are no quests, and shows the key help and a message', () => {
    expect(renderList([], LIST, { level: 1, width: 80, color: false })).toContain('No open quests');
    const text = renderList(QUESTS, { ...LIST, message: '✓ Done · +100 XP' }, { level: 1, width: 80, color: false });
    expect(text).toContain('✓ Done · +100 XP');
    expect(text).toContain('Enter open');
  });
});

describe('renderCard', () => {
  it('shows the full card and offers to take the quest, then the check keys', () => {
    const open = renderCard(QUESTS[0] as Quest, { level: 1, color: false });
    expect(open).toContain('QUEST Quest aaaaa1');
    expect(open).toContain('Enter take it');
    const taken = renderCard(QUESTS[2] as Quest, { level: 1, color: false });
    expect(taken).toContain('IN PROGRESS');
    expect(taken).not.toContain('Enter take it');
    expect(taken).toContain('V check');
  });
});

describe('step', () => {
  it('moves the cursor within the list and never leaves it', () => {
    expect(step(LIST, 'down', QUESTS).ui.index).toBe(1);
    expect(step({ mode: 'list', index: 2 }, 'down', QUESTS).ui.index).toBe(2);
    expect(step(LIST, 'up', QUESTS).ui.index).toBe(0);
  });

  it('Enter opens the card; Esc goes back', () => {
    const card = step({ mode: 'list', index: 1 }, 'enter', QUESTS).ui;
    expect(card).toMatchObject({ mode: 'card', index: 1 });
    expect(step(card, 'esc', QUESTS).ui.mode).toBe('list');
  });

  it('Enter in the card of a fresh quest takes it; on a taken one it does nothing', () => {
    const fresh = step({ mode: 'card', index: 0 }, 'enter', QUESTS);
    expect(fresh.action).toEqual({ type: 'accept', quest: 'aaaaa1' });
    const taken = step({ mode: 'card', index: 2 }, 'enter', QUESTS);
    expect(taken.action).toBeUndefined();
  });

  it('V checks the selected quest, R refreshes, Q quits', () => {
    expect(step(LIST, 'verify', QUESTS).action).toEqual({ type: 'verify', quest: 'aaaaa1' });
    expect(step(LIST, 'refresh', QUESTS).action).toEqual({ type: 'refresh' });
    expect(step(LIST, 'quit', QUESTS).action).toEqual({ type: 'quit' });
  });

  it('with no quests the keys do nothing but refresh and quit', () => {
    expect(step(LIST, 'enter', []).ui.mode).toBe('list');
    expect(step(LIST, 'verify', []).action).toBeUndefined();
  });

  it('a pressed key clears the old message', () => {
    expect(step({ ...LIST, message: 'old' }, 'down', QUESTS).ui.message).toBeUndefined();
  });
});

describe('reconcile', () => {
  it('keeps the cursor inside a list that got shorter', () => {
    expect(reconcile({ mode: 'list', index: 2 }, QUESTS.slice(0, 1)).index).toBe(0);
  });

  it('follows the open card when the list is reordered, and drops it when its quest is gone', () => {
    const card: BoardUi = { mode: 'card', index: 0, questId: 'aaaaa1' };
    expect(reconcile(card, [QUESTS[1] as Quest, QUESTS[0] as Quest])).toMatchObject({ mode: 'card', index: 1 });
    expect(reconcile(card, QUESTS.slice(1)).mode).toBe('list');
  });
});

describe('board in Russian', () => {
  it('the list and the card speak Russian and still fit the width', () => {
    const text = renderList(QUESTS, LIST, { level: 1, width: 60, color: false, lang: 'ru' });
    expect(text).toContain('В РАБОТЕ');
    expect(text).toContain('Enter открыть');
    expect(text.split('\n').every((line) => [...line].length <= 60)).toBe(true);
    expect(renderCard(QUESTS[0] as Quest, { level: 1, color: false, lang: 'ru' })).toContain('Enter взять в работу');
    expect(renderCard(QUESTS[2] as Quest, { level: 1, color: false, lang: 'ru' })).toContain('● В РАБОТЕ');
  });

  it('L asks for a language switch, in the list and in a card', () => {
    expect(parseKey('l')).toBe('language');
    expect(parseKey('L')).toBe('language');
    expect(step(LIST, 'language', QUESTS).action).toEqual({ type: 'language' });
    expect(step({ mode: 'card', index: 0 }, 'language', QUESTS).action).toEqual({ type: 'language' });
  });
});
