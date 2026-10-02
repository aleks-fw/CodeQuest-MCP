export interface Sprite {
  rows: string[];
  palette: Record<string, string>;
}

/** A symmetric picture is written as its left half; `.` is transparent. */
export const mirror = (half: string[]): string[] => half.map((row) => row + [...row].reverse().join(''));

export const CLASS_IDS = ['architect', 'tester', 'guardian', 'optimizer', 'cleaner', 'bug-hunter'] as const;
export const BOSS_IDS = [
  'dark-forest',
  'graveyard',
  'clone-army',
  'secret-leak',
  'blind-spots',
  'breach',
  'todo-swamp',
] as const;

// Hero 10×14: o outline, h hair, s skin, e eye, b body, l legs, a emblem (the emblem is drawn over the chest).
const HERO_ROWS = [
  '...oooo...',
  '..ohhhho..',
  '..ohhhho..',
  '..oesseo..',
  '..osssso..',
  '.obbbbbbo.',
  'obbbbbbbbo',
  'osbbbbbbso',
  'osbbbbbbso',
  '.obbbbbbo.',
  '..ollllo..',
  '..ol..lo..',
  '..ol..lo..',
  '.ooo..ooo.',
];

/** 3×3 chest emblems, drawn at column 3, row 6. */
const EMBLEMS: Record<string, string[]> = {
  architect: ['a.a', 'aaa', 'a.a'],
  tester: ['..a', 'a.a', '.a.'],
  guardian: ['aaa', 'aaa', '.a.'],
  optimizer: ['.aa', '.a.', 'aa.'],
  cleaner: ['a.a', '.a.', 'a.a'],
  'bug-hunter': ['.a.', 'aaa', '.a.'],
};

const HERO_COLORS: Record<string, { b: string; h: string; a: string }> = {
  architect: { b: '#3b6fb6', h: '#8a5a2b', a: '#f2d16b' },
  tester: { b: '#3f9e5a', h: '#5a3b1e', a: '#ffffff' },
  guardian: { b: '#8f8f9d', h: '#c9c9d6', a: '#d9a520' },
  optimizer: { b: '#d9822b', h: '#2b2b2b', a: '#fff27a' },
  cleaner: { b: '#7a5bb5', h: '#e6c95a', a: '#e8f4ff' },
  'bug-hunter': { b: '#b03a3a', h: '#3a2a1a', a: '#f5f5f5' },
};
const NEUTRAL = { b: '#6b7280', h: '#4b3621', a: '#6b7280' };

/** Own-property lookup: an id from a newer version must never reach `Object.prototype`. */
const own = <T>(table: Record<string, T>, id: string | null): T | undefined =>
  id !== null && Object.hasOwn(table, id) ? table[id] : undefined;

export function heroSprite(classId: string | null): Sprite {
  const colors = own(HERO_COLORS, classId) ?? NEUTRAL;
  const emblem = own(EMBLEMS, classId);
  const rows = HERO_ROWS.map((row, y) => {
    const line = emblem?.[y - 6];
    return line === undefined ? row : row.slice(0, 3) + line + row.slice(6);
  });
  return {
    rows,
    palette: { o: '#1b1b1b', h: colors.h, s: '#f1c7a1', e: '#222222', b: colors.b, l: '#3a3f55', a: colors.a },
  };
}

// Bosses 12×10, written as left halves of 6 columns: a main, b second, o outline, e eye.
interface BossDef {
  half: string[];
  a: string;
  b: string;
}

const BOSS_HALVES: Record<string, BossDef> = {
  'dark-forest': {
    half: ['..aaaa', '.aaaaa', 'aaabaa', 'aaaaaa', '.aaaaa', '.aeaaa', '..bbbb', '..obbb', '..obbb', '.ooooo'],
    a: '#2f6b3a',
    b: '#6b4a2b',
  },
  graveyard: {
    half: ['..oooo', '.oaaaa', 'oaaaaa', 'oaeaaa', 'oaaaaa', 'oaaoob', '.oaaab', '.oaaaa', '.oaoao', '..o.o.'],
    a: '#9aa3ad',
    b: '#5b6670',
  },
  'clone-army': {
    half: ['......', '..oooo', '.oaaaa', 'oaaaaa', 'oaeaaa', 'oaaaaa', 'oaabbb', 'oaaaaa', '.oaaaa', '..oooo'],
    a: '#4fc3a1',
    b: '#2f8f75',
  },
  'secret-leak': {
    half: ['..oooo', '.oaaaa', 'oaaaaa', 'oaeaaa', 'oaaaaa', '.oaabb', '..oaab', '..oaab', '..o.ab', '..o..a'],
    a: '#d4a72c',
    b: '#8f6f10',
  },
  'blind-spots': {
    half: ['..oooo', '.oaaaa', 'oaaaaa', 'oabbbb', 'oabeee', 'oabeee', 'oabbbb', 'oaaaaa', '.oaaaa', '..oooo'],
    a: '#7a4fb3',
    b: '#e8e8e8',
  },
  breach: {
    half: ['o....a', 'oo..aa', '.oaaaa', '.oaaaa', 'oaeaaa', 'oaaaaa', 'oaabbb', 'oaaooo', '.oaaaa', '..o.o.'],
    a: '#c0392b',
    b: '#6e1f16',
  },
  'todo-swamp': {
    half: ['...o..', '..o.o.', '.ooooo', 'oaaaaa', 'oaeaaa', 'oaaaaa', 'oabaab', 'oaaaaa', '.oaaaa', '..oooo'],
    a: '#7f8c3a',
    b: '#4a5320',
  },
};
const GENERIC_BOSS: BossDef = {
  half: ['..oooo', '.oaaaa', 'oaaaaa', 'oaeaaa', 'oaaaaa', 'oaaoaa', 'oaaaaa', '.oaaaa', '..oooo', '......'],
  a: '#7c7c7c',
  b: '#4a4a4a',
};

export function bossSprite(id: string): Sprite {
  const def = own(BOSS_HALVES, id) ?? GENERIC_BOSS;
  return { rows: mirror(def.half), palette: { o: '#1b1b1b', e: '#ff4040', a: def.a, b: def.b } };
}
