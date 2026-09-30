import { describe, expect, it } from 'vitest';
import {
  type BoardUi,
  parseKey,
  reconcile,
  renderCard,
  renderList,
  step,
  windowAround,
} from '../../src/hud/board-ui.js';
import { kindOf, rewardOf } from '../../src/hud/quests.js';
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

  it('the Russian keyboard layout works too', () => {
    expect(parseKey('д')).toBe('language');
    expect(parseKey('Д')).toBe('language');
    expect(parseKey('м')).toBe('verify');
    expect(parseKey('М')).toBe('verify');
    expect(parseKey('к')).toBe('refresh');
    expect(parseKey('К')).toBe('refresh');
    expect(parseKey('й')).toBe('quit');
    expect(parseKey('Й')).toBe('quit');
    expect(parseKey('о')).toBe('down');
    expect(parseKey('О')).toBe('down');
    expect(parseKey('л')).toBe('up');
    expect(parseKey('Л')).toBe('up');
  });

  it('the help line keeps Q before L, so a cut line still shows how to quit', () => {
    const en = renderList(QUESTS, LIST, { level: 1, width: 80, color: false });
    expect(en).toContain('R refresh · Q quit · L language');
    const ru = renderList(QUESTS, LIST, { level: 1, width: 90, color: false, lang: 'ru' });
    expect(ru).toContain('R обновить · Q выйти · L язык');
  });

  it('Russian rows line up on the widest kind', () => {
    const rows = [quest('aaaaa1', { category: 'testing' }), quest('bbbbb2', { category: 'maintainability' })];
    const lines = renderList(rows, LIST, { level: 1, width: 120, color: false, lang: 'ru' })
      .split('\n')
      .filter((line) => line.includes('XP'));
    expect(lines[0]?.indexOf('+')).toBe(lines[1]?.indexOf('+'));
  });

  it('L asks for a language switch, in the list and in a card', () => {
    expect(parseKey('l')).toBe('language');
    expect(parseKey('L')).toBe('language');
    expect(step(LIST, 'language', QUESTS).action).toEqual({ type: 'language' });
    expect(step({ mode: 'card', index: 0 }, 'language', QUESTS).action).toEqual({ type: 'language' });
  });
});

describe('narrow terminals lose no information', () => {
  const taken = quest('ddddd4', {
    title: 'Remove Hardcoded Secret',
    category: 'security',
    difficulty: 'hard',
    acceptedAt: '2026-09-30T10:00:00Z',
  });
  const list = [quest('aaaaa1', { category: 'security' }), taken];

  it('the IN PROGRESS mark and every hint survive a narrow screen, in both languages', () => {
    for (const lang of ['en', 'ru'] as const) {
      const text = renderList(list, LIST, { level: 1, width: 44, color: false, lang });
      const lines = text.split('\n');
      expect(
        lines.every((line) => [...line].length <= 44),
        `${lang} width`,
      ).toBe(true);
      const mark = lang === 'ru' ? 'В РАБОТЕ' : 'IN PROGRESS';
      expect(
        lines.filter((line) => line.includes(mark)),
        `${lang} mark`,
      ).toHaveLength(1);
      expect(
        lines.find((line) => line.includes(mark)),
        lang,
      ).toContain('+500 XP');
      const help = lines.join(' ');
      for (const hint of lang === 'ru'
        ? ['Enter открыть', 'Q выйти', 'L язык']
        : ['Enter open', 'Q quit', 'L language']) {
        expect(help, `${lang} ${hint}`).toContain(hint);
      }
    }
  });

  it('a long description wraps onto a second line instead of being cut', () => {
    const text = renderList([QUESTS[0] as Quest], LIST, { level: 1, width: 60, color: false });
    expect(text).toContain('and on.');
    expect(text).not.toContain('…');
  });

  it('a very long description is cut with an ellipsis after two lines', () => {
    const long = quest('eeeee5', { description: 'word '.repeat(80) });
    const text = renderList([long], LIST, { level: 1, width: 40, color: false });
    expect(text.split('\n').filter((line) => line.startsWith('     ')).length).toBe(2);
    expect(text).toContain('…');
  });

  it('wide terminals keep the one-line layout of before', () => {
    const text = renderList([QUESTS[0] as Quest], LIST, { level: 1, width: 200, color: false });
    const lines = text.split('\n');
    expect(lines[0]).toContain('· Cleanup');
    expect(lines[1]?.trim().startsWith('Description of quest aaaaa1')).toBe(true);
    expect(lines[2]).toBe('');
    expect(lines[3]).toBe('↑↓ choose · Enter open · V check · R refresh · Q quit · L language');
  });

  it('the card hints wrap to the width too', () => {
    const card = renderCard(QUESTS[0] as Quest, { level: 1, color: false, lang: 'ru', width: 30 });
    expect(
      card
        .split('\n')
        .slice(-3)
        .every((line) => [...line].length <= 30),
    ).toBe(true);
    expect(card.replace(/\n/g, ' ')).toContain('Esc назад');
  });
});

describe('renderList in Russian quest texts', () => {
  it('shows Russian titles and descriptions and sizes the title column by them', () => {
    const vars = { sk: 'file', sv: 'cart.ts', n: 1, stem: 'cart', cycle: '' };
    const rows = [
      quest('aaaaa1', {
        template: 'clean-up-todos',
        title: 'Clean Up TODOs',
        vars,
        description: 'Resolve or remove the TODO comments in cart.ts.',
      }),
      quest('bbbbb2', { template: 'epic-checkout-master', title: 'Checkout Master', description: 'x' }),
    ];
    const text = renderList(rows, LIST, { level: 1, width: 100, color: false, lang: 'ru' });
    const lines = text.split('\n');
    expect(lines[0]).toContain('Уборка TODO');
    expect(text).toContain('Выполни или удали TODO-комментарии в cart.ts.');
    expect(text).toContain('Мастер оформления заказа');
    expect(text).not.toContain('Clean Up TODOs');
    const rowsOnly = lines.filter((line) => line.includes(' XP'));
    // The columns are aligned by the widest Russian title (24 characters).
    expect(rowsOnly[0]?.indexOf('+')).toBe(rowsOnly[1]?.indexOf('+'));
    expect(rowsOnly[0]).toContain('Уборка TODO'.padEnd(24));
  });
});

describe('narrow terminals with Russian quest texts', () => {
  const file = { sk: 'file', sv: 'cart.ts', n: 1, stem: 'cart', cycle: '' };
  const dir = { sk: 'dir', sv: 'src/', n: 3, stem: 'a', cycle: '' };
  const rows = [
    quest('aaaaa1', {
      template: 'remove-hardcoded-secret',
      title: 'Remove Hardcoded Secret',
      category: 'security',
      vars: file,
    }),
    quest('bbbbb2', { template: 'async-file-access', title: 'Async File Access', category: 'performance', vars: dir }),
    quest('ccccc3', {
      template: 'fix-mutable-defaults',
      title: 'Fix Mutable Defaults',
      category: 'bug',
      difficulty: 'hard',
      vars: file,
      acceptedAt: '2026-09-30T10:00:00Z',
    }),
  ];
  const kinds = rows.map((row) => kindOf('ru', row));

  for (const width of [45, 60]) {
    it(`width ${width}: nothing overflows, the taken row keeps its mark and XP, columns stay aligned`, () => {
      const text = renderList(rows, LIST, { level: 1, width, color: false, lang: 'ru' });
      const lines = text.split('\n');
      expect(lines.every((line) => [...line].length <= width)).toBe(true);
      expect(text).toContain('Секрет');
      expect(text).not.toContain('Remove Hardcoded Secret');
      const taken = lines.filter((line) => line.includes('В РАБОТЕ'));
      expect(taken).toHaveLength(1);
      expect(taken[0]).toContain(`+${rewardOf(rows[2] as Quest, 1)} XP`);
      const heads = lines.filter((line) => line.includes(' XP'));
      expect(heads).toHaveLength(3);
      const plus = heads.map((line) => [...line].indexOf('+'));
      // The layout is chosen once for all rows: all show the kind column or none does, and the XP column lines up.
      const withKind = heads.map((head, index) => head.includes(kinds[rows.indexOf(rows[index] as Quest)] ?? ''));
      expect(new Set(withKind).size).toBe(1);
      expect(new Set(plus).size).toBe(1);
      // The longest Russian row does not fit with the kind column even at 60, so it goes for every row.
      expect(withKind[0]).toBe(false);
    });
  }
});

describe('long titles in another language', () => {
  const long = 'Очень длинное название квеста которое не помещается';
  const rows = [
    quest('aaaaa1', { title: long, template: 'no-such' }),
    quest('bbbbb2', { title: 'Коротко', template: 'no-such' }),
  ];
  it('a Russian title longer than the column is cut with an ellipsis and the rows stay aligned', () => {
    const lines = renderList(rows, LIST, { level: 1, width: 200, color: false, lang: 'ru' }).split('\n');
    const [first, second] = lines.filter((line) => line.includes('+'));
    expect(first).toContain(`${[...long].slice(0, 27).join('')}…`);
    expect(first).not.toContain(long);
    expect(first?.indexOf('+')).toBe(second?.indexOf('+'));
  });
  it('an English title longer than the column stays as it is', () => {
    const wide = [quest('aaaaa1', { title: 'A very long English quest title here!' }), quest('bbbbb2')];
    const text = renderList(wide, LIST, { level: 1, width: 200, color: false });
    expect(text).toContain('A very long English quest title here!');
  });
});

describe('list window on a short screen', () => {
  it('keeps the cursor inside the rows and never draws more than fit', () => {
    const heights = Array.from({ length: 10 }, () => 3);
    for (let index = 0; index < 10; index++) {
      const { start, end } = windowAround(heights, index, 10);
      expect(start).toBeLessThanOrEqual(index);
      expect(end).toBeGreaterThan(index);
      expect((end - start) * 3).toBeLessThanOrEqual(10);
    }
    expect(windowAround(heights, 0, 100)).toEqual({ start: 0, end: 10 });
  });

  it('renderList with rows draws fewer lines than the full list and keeps the selected quest', () => {
    const many = Array.from({ length: 12 }, (_, index) => quest(`q${String(index).padStart(4, '0')}`));
    const options = { level: 1, width: 100, color: false };
    const full = renderList(many, { mode: 'list', index: 11 }, options).split('\n').length;
    const cut = renderList(many, { mode: 'list', index: 11 }, { ...options, rows: 12 });
    expect(cut.split('\n').length).toBeLessThanOrEqual(12);
    expect(cut.split('\n').length).toBeLessThan(full);
    expect(cut).toContain('▶');
  });
});

describe('cancelling a taken quest', () => {
  it('C on the card of a taken quest asks to cancel it; on a free quest or in the list it does nothing', () => {
    expect(parseKey('c')).toBe('cancel');
    expect(parseKey('с')).toBe('cancel');
    expect(step({ mode: 'card', index: 2 }, 'cancel', QUESTS).action).toEqual({ type: 'cancel', quest: 'ccccc3' });
    expect(step({ mode: 'card', index: 0 }, 'cancel', QUESTS).action).toBeUndefined();
    expect(step({ mode: 'list', index: 2 }, 'cancel', QUESTS).action).toBeUndefined();
  });

  it('the card of a taken quest shows the cancel hint in both languages; a free one does not', () => {
    const taken = QUESTS[2] as Quest;
    const free = QUESTS[0] as Quest;
    expect(renderCard(taken, { level: 1, color: false })).toContain('C cancel the quest');
    expect(renderCard(taken, { level: 1, color: false, lang: 'ru' })).toContain('C отменить квест');
    expect(renderCard(free, { level: 1, color: false })).not.toContain('cancel');
  });
});
