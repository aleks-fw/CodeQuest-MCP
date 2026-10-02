# CodeQuest: классы — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Класс проекта (6 классов и гибриды) по доле проверенной работы по категориям: название в HUD и состоянии проекта, звёздочки у статов класса. Только показ, XP и доска не меняются.

**Architecture:** Чистая функция `classOf(events)` в `src/game/classes.ts` (из `quest_completed` журнала, вес по сложности, без уровня). Результат кладётся в `CycleResult.playerClass` и `ProjectView.playerClass` (по образцу `owed`), тексты — в `src/hud/classes.ts`, подсветка — в `formatHud`/`formatStats`/`formatState`.

**Tech Stack:** TypeScript (strict), Vitest, Biome, `@modelcontextprotocol/sdk`.

**Spec:** `docs/superpowers/specs/2026-10-02-codequest-classes-design.md`

## Global Constraints

- Только показ: не менять формулы XP, доску квестов, достижения и историю.
- Источник — события `quest_completed` журнала; каждый квест один раз по `id` (событие без `id` считается отдельным); учитываются только категории из таблицы спецификации §2; вес = `BASE_XP[difficulty]` (Easy 100, Medium 300, Hard 500, Epic 1200), без уменьшения за уровень.
- Порог: меньше 3 учтённых квестов — класса нет (`null`). Гибрид: вторая доля ≥ 60% от первой и ≥ 20% от всего; границы сравнивать в целых числах (по весам), не по дробным долям.
- Без класса вывод HUD, `formatStats` и `formatState` совпадает с нынешним побайтно (существующие тесты не менять по смыслу).
- Тексты на ru и en; у каждого ключа одинаковые плейсхолдеры (проверяет `tests/i18n/i18n.test.ts`).
- Автор коммитов `aleks-fw`, в конце сообщения строка `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Push не делать.
- Править файлы через Edit/Write, не через heredoc/Python с обратными слэшами (они превращаются в настоящие переводы строк). Полный `npm run check` — 3–5 минут.

## Review Focus

1. Ровно 60% и ровно 20% — гибрид; чуть ниже — нет; расчёт в целых числах. Задача 1.
2. Один и тот же квест, закрытый много раз, считается один раз. Задача 1.
3. Неверные типы данных (`category: 5`, `difficulty: 7`, неизвестная сложность): квест не учитывается, ничего не падает. Задача 1.
4. Два учтённых квеста и много квестов вне классов (documentation, dependencies) — класса нет. Задача 1.
5. Гибрид: статы сначала основного класса, потом второго (общих статов у классов нет, повторов быть не может). Задача 1.
6. Проект без класса: HUD побайтно как раньше; быстрый путь цикла и полный цикл дают один и тот же класс. Задачи 2 и 3.

---

### Task 1: Ядро — `classOf`

**Files:**
- Create: `src/game/classes.ts`
- Test: `tests/game/classes.test.ts`

**Interfaces:**
- Consumes: `BASE_XP` из `src/game/xp.ts`; `Stats` из `src/types.ts`.
- Produces (используют задачи 2–4):
  - `type ClassId = 'architect' | 'tester' | 'guardian' | 'optimizer' | 'cleaner' | 'bug-hunter'`
  - `interface ClassDef { id: ClassId; categories: readonly string[]; stats: readonly (keyof Stats)[] }` и `const CLASSES: readonly ClassDef[]` (в порядке таблицы)
  - `interface ClassShare { id: ClassId; share: number }` (доля 0..1)
  - `interface PlayerClass { primary: ClassId; secondary?: ClassId; shares: ClassShare[]; stats: (keyof Stats)[] }`
  - `interface ClassEvent { type: string; data?: Record<string, unknown> }`
  - `classOf(events: readonly ClassEvent[]): PlayerClass | null`

- [ ] **Step 1: Write the failing test**

Создать `tests/game/classes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CLASSES, type ClassEvent, classOf } from '../../src/game/classes.js';

let counter = 0;
const q = (category: unknown, difficulty: unknown, id: string | undefined = `q${++counter}`): ClassEvent => ({
  type: 'quest_completed',
  data: { category, difficulty, ...(id === undefined ? {} : { id }) },
});

describe('classOf', () => {
  it('weighs quests by difficulty and orders the classes by their share', () => {
    const player = classOf([q('architecture', 'medium'), q('architecture', 'easy'), q('testing', 'hard')]);
    expect(player?.primary).toBe('tester');
    expect(player?.secondary).toBe('architect');
    expect(player?.shares.map((share) => share.id)).toEqual(['tester', 'architect']);
    expect(player?.shares[0]?.share).toBeCloseTo(500 / 900);
    expect(player?.shares[1]?.share).toBeCloseTo(400 / 900);
  });

  it('is one class, without a hybrid, when all the work is of one kind', () => {
    const player = classOf([q('testing', 'easy'), q('testing', 'easy'), q('testing', 'epic')]);
    expect(player).toEqual({ primary: 'tester', shares: [{ id: 'tester', share: 1 }], stats: ['testing'] });
  });

  it('needs 3 counted quests: fewer, or many outside the classes, give no class', () => {
    expect(classOf([])).toBeNull();
    expect(classOf([q('testing', 'hard'), q('testing', 'hard')])).toBeNull();
    const outside = [q('documentation', 'easy'), q('dependencies', 'easy'), q('documentation', 'hard')];
    expect(classOf([q('bug', 'easy'), q('bug', 'easy'), ...outside, ...outside])).toBeNull();
    expect(classOf([q('bug', 'easy'), q('bug', 'easy'), q('bug', 'easy'), ...outside])?.primary).toBe('bug-hunter');
  });

  it('counts a quest once, however often it was completed', () => {
    const same = Array.from({ length: 6 }, () => q('architecture', 'medium', 'same'));
    expect(classOf(same)).toBeNull();
    expect(classOf([...same, q('testing', 'easy'), q('testing', 'easy')])?.shares).toHaveLength(2);
    const twoMore = classOf([...same, q('architecture', 'easy'), q('architecture', 'easy')]);
    expect(twoMore?.shares).toEqual([{ id: 'architect', share: 1 }]);
  });

  it('counts an event without an id as its own quest', () => {
    const none = [q('testing', 'easy', undefined), q('testing', 'easy', undefined), q('testing', 'easy', undefined)];
    expect(classOf(none)?.primary).toBe('tester');
  });

  it('ignores wrong-typed or unknown data without failing', () => {
    const odd = [q(5, 'easy'), q('testing', 7), q('testing', 'huge'), q(undefined, 'easy'), q('bug', null)];
    expect(classOf([...odd, q('bug', 'easy'), q('bug', 'easy')])).toBeNull();
    expect(classOf([...odd, q('bug', 'easy'), q('bug', 'easy'), q('bug', 'easy')])?.primary).toBe('bug-hunter');
    expect(classOf([{ type: 'quest_completed' }, { type: 'level_up', data: { to: 5 } }])).toBeNull();
  });

  it('puts equal shares in the order of the table', () => {
    const player = classOf([q('security', 'medium'), q('testing', 'medium'), q('architecture', 'medium')]);
    expect(player?.shares.map((share) => share.id)).toEqual(['architect', 'tester', 'guardian']);
    expect(player?.primary).toBe('architect');
  });

  it('maps every category of the table to its class', () => {
    const pick = (category: string) => classOf([q(category, 'easy'), q(category, 'easy'), q(category, 'easy')])?.primary;
    expect(pick('architecture')).toBe('architect');
    expect(pick('testing')).toBe('tester');
    expect(pick('security')).toBe('guardian');
    expect(pick('reliability')).toBe('guardian');
    expect(pick('performance')).toBe('optimizer');
    expect(pick('cleanup')).toBe('cleaner');
    expect(pick('refactoring')).toBe('cleaner');
    expect(pick('maintainability')).toBe('cleaner');
    expect(pick('bug')).toBe('bug-hunter');
    expect(CLASSES).toHaveLength(6);
  });
});

describe('the hybrid', () => {
  it('is made when the second class has exactly 60% of the first, not below', () => {
    const exact = classOf([q('architecture', 'hard'), q('testing', 'medium'), q('bug', 'easy')]);
    expect(exact?.secondary).toBe('tester');
    const below = classOf([q('architecture', 'hard'), q('testing', 'easy'), q('testing', 'easy')]);
    expect(below?.primary).toBe('architect');
    expect(below?.secondary).toBeUndefined();
  });

  it('needs the second class to have at least 20% of all the work', () => {
    const five = [
      q('architecture', 'hard'),
      q('testing', 'medium'),
      q('security', 'medium'),
      q('performance', 'medium'),
      q('cleanup', 'easy'),
    ];
    expect(classOf(five)?.secondary).toBe('tester');
    expect(classOf([...five, q('bug', 'medium')])?.secondary).toBeUndefined();
  });

  it('takes only the two biggest into the name and lists the stats of the primary class, then of the second', () => {
    const player = classOf([q('architecture', 'medium'), q('testing', 'medium'), q('maintainability', 'medium')]);
    expect(player?.primary).toBe('architect');
    expect(player?.secondary).toBe('tester');
    expect(player?.shares).toHaveLength(3);
    expect(player?.stats).toEqual(['architecture', 'maintainability', 'testing']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/classes.test.ts`
Expected: FAIL, не найден модуль `../../src/game/classes.js`.

- [ ] **Step 3: Write minimal implementation**

Создать `src/game/classes.ts`:

```ts
import type { Stats } from '../types.js';
import { BASE_XP } from './xp.js';

export type ClassId = 'architect' | 'tester' | 'guardian' | 'optimizer' | 'cleaner' | 'bug-hunter';

export interface ClassDef {
  id: ClassId;
  /** The quest categories whose completed quests count for this class. */
  categories: readonly string[];
  /** The stats the class highlights. */
  stats: readonly (keyof Stats)[];
}

/** In this order equal shares are ranked (spec §2). */
export const CLASSES: readonly ClassDef[] = [
  { id: 'architect', categories: ['architecture'], stats: ['architecture', 'maintainability'] },
  { id: 'tester', categories: ['testing'], stats: ['testing'] },
  { id: 'guardian', categories: ['security', 'reliability'], stats: ['security', 'reliability'] },
  { id: 'optimizer', categories: ['performance'], stats: ['performance'] },
  { id: 'cleaner', categories: ['cleanup', 'refactoring', 'maintainability'], stats: ['cleanCode', 'techDebt'] },
  { id: 'bug-hunter', categories: ['bug'], stats: ['bugs'] },
];

/** Fewer counted quests than this: no class yet. */
export const MIN_QUESTS = 3;

export interface ClassShare {
  id: ClassId;
  /** 0..1 */
  share: number;
}

export interface PlayerClass {
  primary: ClassId;
  secondary?: ClassId;
  /** Every class with some work, the biggest first. */
  shares: ClassShare[];
  /** The stats of the primary class, then of the secondary one, without repeats. */
  stats: (keyof Stats)[];
}

/** A journal event, or one of the current cycle (it has no `seq` yet): only the type and the data matter here. */
export interface ClassEvent {
  type: string;
  data?: Record<string, unknown>;
}

const BY_CATEGORY = new Map(CLASSES.flatMap((def) => def.categories.map((category) => [category, def] as const)));

const weightOf = (difficulty: unknown): number =>
  typeof difficulty === 'string' && Object.hasOwn(BASE_XP, difficulty) ? BASE_XP[difficulty as keyof typeof BASE_XP] : 0;

/**
 * The class of a project from its completed quests (spec §2). Weights are whole numbers, so the borders of the hybrid
 * (60% of the first, 20% of the total) are compared exactly, not as fractions.
 */
export function classOf(events: readonly ClassEvent[]): PlayerClass | null {
  const weights = new Map<ClassId, number>();
  const seen = new Set<string>();
  let quests = 0;
  let total = 0;
  for (const event of events) {
    if (event.type !== 'quest_completed') continue;
    const data = event.data ?? {};
    const def = typeof data.category === 'string' ? BY_CATEGORY.get(data.category) : undefined;
    const weight = weightOf(data.difficulty);
    if (def === undefined || weight === 0) continue;
    if (typeof data.id === 'string') {
      if (seen.has(data.id)) continue;
      seen.add(data.id);
    }
    quests++;
    total += weight;
    weights.set(def.id, (weights.get(def.id) ?? 0) + weight);
  }
  if (quests < MIN_QUESTS) return null;

  const ranked = CLASSES.map((def) => ({ def, weight: weights.get(def.id) ?? 0 }))
    .filter((item) => item.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const [first, second] = ranked;
  if (first === undefined) return null;
  const hybrid = second !== undefined && second.weight * 10 >= first.weight * 6 && second.weight * 5 >= total;

  const stats = [...first.def.stats];
  if (hybrid) for (const stat of second.def.stats) if (!stats.includes(stat)) stats.push(stat);
  const player: PlayerClass = {
    primary: first.def.id,
    shares: ranked.map((item) => ({ id: item.def.id, share: item.weight / total })),
    stats,
  };
  if (hybrid) player.secondary = second.def.id;
  return player;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/game/classes.test.ts`
Expected: PASS. Затем `npx tsc --noEmit` и `npx biome check --write .`.

- [ ] **Step 5: Commit**

```bash
git add src/game/classes.ts tests/game/classes.test.ts
git commit -m "feat(classes): the class of a project from its completed quests

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Тексты и подсветка — каталоги, `hud/classes.ts`, HUD, статы, состояние

**Files:**
- Create: `src/hud/classes.ts`
- Modify: `src/i18n/en.ts`, `src/i18n/ru.ts` (после блока `achievement.*`)
- Modify: `src/hud/hud.ts` (`formatHud`), `src/hud/report.ts` (`formatStats`, `StateInput`, `formatState`), `src/hud/present.ts` (`hudText`, `statsText`, `stateText`: пока передают `undefined`, подключение в задаче 3)
- Test: `tests/hud/classes.test.ts`, дополнения в `tests/hud/hud.test.ts`

**Interfaces:**
- Consumes: `PlayerClass`, `ClassId`, `classOf` (задача 1); `t`, `Lang`.
- Produces:
  - `classLabel(id: ClassId, lang: Lang): string`
  - `className(player: PlayerClass, lang: Lang): string` — название класса или гибрида
  - `classLine(player: PlayerClass, lang: Lang): string` — «Class: Test Architect (Tester 56% · Architect 44%)»
  - `formatHud(xp, stats, lang = 'en', playerClass: PlayerClass | null = null)`
  - `formatStats(stats, findings, limit = 8, lang = 'en', playerClass: PlayerClass | null = null)`
  - `StateInput.playerClass?: PlayerClass | null`

- [ ] **Step 1: Write the failing tests**

Создать `tests/hud/classes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { type ClassEvent, classOf } from '../../src/game/classes.js';
import { classLabel, classLine, className } from '../../src/hud/classes.js';
import { formatHud, formatMinimal } from '../../src/hud/hud.js';
import { formatState, formatStats } from '../../src/hud/report.js';
import type { Stats } from '../../src/types.js';

let counter = 0;
const q = (category: string, difficulty: string): ClassEvent => ({
  type: 'quest_completed',
  data: { category, difficulty, id: `q${++counter}` },
});

const STATS: Stats = {
  architecture: 78,
  testing: 71,
  security: 44,
  performance: 100,
  cleanCode: 14,
  reliability: 60,
  maintainability: 55,
  bugs: 0,
  techDebt: 20,
};

const tester = classOf([q('testing', 'easy'), q('testing', 'easy'), q('testing', 'easy')]);
const testArchitect = classOf([q('architecture', 'medium'), q('architecture', 'easy'), q('testing', 'hard')]);
const cleanerBug = classOf([q('cleanup', 'medium'), q('bug', 'medium'), q('cleanup', 'easy')]);

describe('the names of the classes', () => {
  it('names a single class, in both languages', () => {
    expect(tester && className(tester, 'en')).toBe('Tester');
    expect(tester && className(tester, 'ru')).toBe('Тестировщик');
    expect(classLabel('bug-hunter', 'ru')).toBe('Охотник за багами');
    expect(classLabel('guardian', 'en')).toBe('Guardian');
  });

  it('names Architect + Tester Test Architect in either order, any other pair A + B', () => {
    expect(testArchitect && className(testArchitect, 'en')).toBe('Test Architect');
    expect(testArchitect && className(testArchitect, 'ru')).toBe('Тест-архитектор');
    const reversed = classOf([q('architecture', 'hard'), q('testing', 'medium'), q('testing', 'easy')]);
    expect(reversed?.primary).toBe('architect');
    expect(reversed && className(reversed, 'en')).toBe('Test Architect');
    expect(cleanerBug && className(cleanerBug, 'en')).toBe('Cleaner + Bug Hunter');
    expect(cleanerBug && className(cleanerBug, 'ru')).toBe('Уборщик + Охотник за багами');
  });
});

describe('classLine', () => {
  it('shows the class and every share rounded to a whole percent', () => {
    expect(testArchitect && classLine(testArchitect, 'en')).toBe('Class: Test Architect (Tester 56% · Architect 44%)');
    expect(testArchitect && classLine(testArchitect, 'ru')).toBe(
      'Класс: Тест-архитектор (Тестировщик 56% · Архитектор 44%)',
    );
    expect(tester && classLine(tester, 'en')).toBe('Class: Tester (Tester 100%)');
  });
});

describe('the HUD with a class', () => {
  it('without a class it is exactly what it was', () => {
    expect(formatHud(3240, STATS, 'en', null)).toBe(formatHud(3240, STATS));
    expect(formatHud(3240, STATS)).not.toContain('★');
    expect(formatMinimal(3240)).toBe('⚔️ LVL 7 · ANALYST · 3,240 XP');
  });

  it('adds the class to the first line and a star to the stats of the class that the HUD shows', () => {
    const lines = formatHud(3240, STATS, 'en', tester).split('\n');
    expect(lines[0]).toBe('⚔️ LVL 7 · ANALYST · Tester');
    expect(lines[2]).toBe('🧠 78 🧪 71★ 🛡️ 44');
    expect(lines[3]).toBe('⚡ 100 🧹 14 🐛 0');
    expect(formatHud(3240, STATS, 'ru', tester).split('\n')[0]).toContain('· Тестировщик');
  });

  it('stars the stats of both classes of a hybrid, and only the ones the HUD shows', () => {
    const lines = formatHud(3240, STATS, 'en', testArchitect).split('\n');
    expect(lines[0]).toContain('· Test Architect');
    expect(lines[2]).toBe('🧠 78★ 🧪 71★ 🛡️ 44');
    expect(lines[3]).toBe('⚡ 100 🧹 14 🐛 0');
    const cleaner = formatHud(3240, STATS, 'en', cleanerBug).split('\n');
    expect(cleaner[3]).toBe('⚡ 100 🧹 14★ 🐛 0★');
  });
});

describe('the stats list and the state with a class', () => {
  it('stars every stat of the class in the list of nine', () => {
    const lines = formatStats(STATS, [], 8, 'en', testArchitect).split('\n');
    expect(lines).toContain('Architecture: 78★');
    expect(lines).toContain('Maintainability: 55★');
    expect(lines).toContain('Testing: 71★');
    expect(lines).toContain('Security: 44');
    expect(formatStats(STATS, [], 8, 'en', null)).toBe(formatStats(STATS, [], 8, 'en'));
    expect(formatStats(STATS, [], 8, 'en')).not.toContain('★');
  });

  it('puts the line of the class under the HUD in the state, and nothing without a class', () => {
    const base = {
      projectName: 'shop',
      root: '/shop',
      xp: 3240,
      stats: STATS,
      quests: [],
      level: 7,
      facts: null,
      errors: [],
      allowCommands: false,
      busy: false,
      unavailable: [],
    };
    const withClass = formatState({ ...base, playerClass: testArchitect }).split('\n');
    expect(withClass[1]).toContain('· Test Architect');
    expect(withClass).toContain('Class: Test Architect (Tester 56% · Architect 44%)');
    const without = formatState({ ...base, playerClass: null });
    expect(without).not.toContain('Class:');
    expect(without).toBe(formatState(base));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hud/classes.test.ts`
Expected: FAIL, не найден модуль `../../src/hud/classes.js`.

- [ ] **Step 3: Write minimal implementation**

3a. В `src/i18n/en.ts` после ключей `achievement.*` добавить:

```ts
  'class.architect': 'Architect',
  'class.tester': 'Tester',
  'class.guardian': 'Guardian',
  'class.optimizer': 'Optimizer',
  'class.cleaner': 'Cleaner',
  'class.bug-hunter': 'Bug Hunter',
  'class.test-architect': 'Test Architect',
  'class.hybrid': '{a} + {b}',
  'class.line': 'Class: {name} ({shares})',
  'class.share': '{name} {percent}%',
```

В `src/i18n/ru.ts` после ключей `achievement.*`:

```ts
  'class.architect': 'Архитектор',
  'class.tester': 'Тестировщик',
  'class.guardian': 'Страж',
  'class.optimizer': 'Оптимизатор',
  'class.cleaner': 'Уборщик',
  'class.bug-hunter': 'Охотник за багами',
  'class.test-architect': 'Тест-архитектор',
  'class.hybrid': '{a} + {b}',
  'class.line': 'Класс: {name} ({shares})',
  'class.share': '{name} {percent}%',
```

3b. Создать `src/hud/classes.ts`:

```ts
import type { ClassId, PlayerClass } from '../game/classes.js';
import { type Lang, t } from '../i18n/index.js';

export const classLabel = (id: ClassId, lang: Lang): string => t(lang, `class.${id}`);

/** The name of the class; a hybrid is `A + B`, and Architect with Tester is Test Architect (the spec of the game). */
export function className(player: PlayerClass, lang: Lang): string {
  if (player.secondary === undefined) return classLabel(player.primary, lang);
  const pair = [player.primary, player.secondary];
  if (pair.includes('architect') && pair.includes('tester')) return t(lang, 'class.test-architect');
  return t(lang, 'class.hybrid', { a: classLabel(player.primary, lang), b: classLabel(player.secondary, lang) });
}

/** `Class: Test Architect (Tester 56% · Architect 44%)`: every share with some work, rounded to a whole percent. */
export function classLine(player: PlayerClass, lang: Lang): string {
  const shares = player.shares
    .map((item) =>
      t(lang, 'class.share', { name: classLabel(item.id, lang), percent: Math.round(item.share * 100) }),
    )
    .join(' · ');
  return t(lang, 'class.line', { name: className(player, lang), shares });
}
```

3c. В `src/hud/hud.ts`: импорты `import type { PlayerClass } from '../game/classes.js';` и `import { className } from './classes.js';`; заменить `formatHud` на:

```ts
/**
 * The four-line HUD of spec §9.6; at level 50 the bar is full and says MAX. A class goes after the title and its stats
 * that the HUD shows get a star; without a class the text is the same as ever.
 */
export function formatHud(xp: number, stats: Stats, lang: Lang = 'en', playerClass: PlayerClass | null = null): string {
  const progress = levelProgress(xp);
  let bar: string;
  if (progress.max) {
    bar = `${progressBar(100)} ${t(lang, 'hud.max')} (${grouped(xp)} XP)`;
  } else {
    const size = progress.xpIntoLevel + (progress.xpToNext ?? 0);
    const percent = Math.floor((progress.xpIntoLevel / size) * 100);
    bar = `${progressBar(percent)} ${percent}% (${progress.xpIntoLevel}/${size})`;
  }
  const star = (name: keyof Stats): string => (playerClass?.stats.includes(name) ? '★' : '');
  const title = `⚔️ ${t(lang, 'hud.lvl')} ${progress.level} · ${hudTitle(progress.level, lang)}`;
  return [
    playerClass === null ? title : `${title} · ${className(playerClass, lang)}`,
    bar,
    `🧠 ${stats.architecture}${star('architecture')} 🧪 ${stats.testing}${star('testing')} 🛡️ ${stats.security}${star('security')}`,
    `⚡ ${stats.performance}${star('performance')} 🧹 ${stats.cleanCode}${star('cleanCode')} 🐛 ${stats.bugs}${star('bugs')}`,
  ].join('\n');
}
```

3d. В `src/hud/report.ts`: импорты `import type { PlayerClass } from '../game/classes.js';` и `import { classLine } from './classes.js';`. В `formatStats` добавить последний параметр `playerClass: PlayerClass | null = null` и заменить строку списка на `lines.push(`${statLabel(lang, name)}: ${stats[name]}${playerClass?.stats.includes(name) ? '★' : ''}`);`. В `StateInput` добавить `playerClass?: PlayerClass | null;`. В `formatState`: `formatHud(input.xp, input.stats, lang, input.playerClass ?? null)` и сразу после строки `const lines = [...]` добавить `if (input.playerClass) lines.push(classLine(input.playerClass, lang));`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/hud tests/i18n tests/game/classes.test.ts`
Expected: PASS, в том числе существующие `tests/hud/hud.test.ts` (вывод без класса не изменился). Затем `npx tsc --noEmit` и `npx biome check --write .`.

- [ ] **Step 5: Commit**

```bash
git add src/hud/classes.ts src/hud/hud.ts src/hud/report.ts src/i18n tests/hud/classes.test.ts
git commit -m "feat(classes): names, class line and starred stats in the HUD, stats and state

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Цикл, вид проекта и подключение к текстам

**Files:**
- Modify: `src/engine/cycle.ts` (`CycleResult.playerClass`, быстрый путь и полный цикл)
- Modify: `src/engine/index.ts` (`ProjectView.playerClass`, `toView`, `saved`)
- Modify: `src/hud/present.ts` (`hudText`, `statsText`, `stateText`), `src/cli/board.ts` (вызов `formatHud`)
- Test: `tests/engine/classes.test.ts`

**Interfaces:**
- Consumes: `classOf`, `PlayerClass` (задача 1); `formatHud`/`formatStats`/`StateInput.playerClass` (задача 2); `readEvents`, `appendEvents` из журнала.
- Produces: `CycleResult.playerClass: PlayerClass | null`; `ProjectView.playerClass: PlayerClass | null` (в режиме «занято» — `null`).

- [ ] **Step 1: Write the failing test**

Создать `tests/engine/classes.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { hudText, stateText, statsText } from '../../src/hud/present.js';
import { appendEvents } from '../../src/storage/journal.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

async function shop() {
  const root = await copyFixture('projects/nextjs-shop');
  const home = await makeTempDir();
  return new Engine({ home, cwd: root, now: () => new Date() });
}

const completed = (category: string, difficulty: string, id: string) => ({
  at: new Date().toISOString(),
  type: 'quest_completed' as const,
  data: { id, category, difficulty, xp: 10 },
});

describe('the class in the view', () => {
  it('a new project has no class and its texts are as before', async () => {
    const engine = await shop();
    const view = await engine.view({});
    expect(view.playerClass).toBeNull();
    expect(hudText(view)).not.toContain('★');
    expect(stateText(view)).not.toContain('Class:');
  });

  it('shows the class once enough quests are completed, the same on the cached and the full path', async () => {
    const engine = await shop();
    const { project } = await engine.view({});
    await appendEvents(engine.storeOf(project).file('events'), [
      completed('testing', 'medium', 'a'),
      completed('testing', 'easy', 'b'),
    ]);
    expect((await engine.refresh({}, true)).playerClass).toBeNull();

    await appendEvents(engine.storeOf(project).file('events'), [completed('architecture', 'medium', 'c')]);
    const full = await engine.refresh({}, true);
    expect(full.playerClass).toMatchObject({ primary: 'tester', secondary: 'architect' });
    const cached = await engine.view({});
    expect(cached.playerClass).toEqual(full.playerClass);

    expect(hudText(cached).split('\n')[0]).toContain('· Test Architect');
    expect(hudText(cached)).toContain('🧪');
    expect(statsText(cached)).toContain('Testing: ');
    expect(statsText(cached)).toContain('★');
    expect(stateText(cached)).toContain('Class: Test Architect (Tester 57% · Architect 43%)');
  });

  it('the class counts the completions of the cycle that is running', async () => {
    const engine = await shop();
    const { project } = await engine.view({});
    await appendEvents(engine.storeOf(project).file('events'), [
      completed('bug', 'easy', 'a'),
      completed('bug', 'easy', 'b'),
      completed('bug', 'easy', 'c'),
    ]);
    const view = await engine.refresh({}, true);
    expect(view.playerClass?.primary).toBe('bug-hunter');
  });
});
```

(57%/43%: 400/700 и 300/700; тестирование medium+easy = 400, архитектура medium = 300.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/classes.test.ts`
Expected: FAIL (`view.playerClass` is undefined).

- [ ] **Step 3: Write minimal implementation**

3a. `src/engine/cycle.ts`: добавить импорт `import { classOf, type PlayerClass } from '../game/classes.js';`; в `CycleResult` после `owed` добавить `/** The class of the project from its completed quests; null while there is too little work. */ playerClass: PlayerClass | null;`; в возврате быстрого пути добавить `playerClass: classOf(loaded.events)`; в возврате полного цикла добавить `playerClass: classOf([...loaded.events, ...events])`.

3b. `src/engine/index.ts`: импорт `import type { PlayerClass } from '../game/classes.js';`; в `ProjectView` добавить `playerClass: PlayerClass | null;` (с комментарием «null, пока работы мало»); в `saved()` — `playerClass: null`; в `toView()` — `playerClass: result.playerClass`.

3c. `src/hud/present.ts`: `stateText` — добавить `playerClass: view.playerClass`; `hudText` — `formatHud(view.state.xp, view.state.stats, view.lang, view.playerClass)`; `statsText` — `formatStats(view.state.stats, view.snapshot?.findings ?? [], 8, view.lang, view.playerClass)`. `src/cli/board.ts`: `formatHud(view.state.xp, view.state.stats, view.lang, view.playerClass)`.

3d. Если `tsc` покажет другие места, где собирается `ProjectView` или `CycleResult` вручную (в тестах), добавить `playerClass: null`.

- [ ] **Step 4: Run tests to verify they pass, then the whole suite**

Run: `npx vitest run tests/engine/classes.test.ts` → PASS.
Run: `npm test` (вывод в файл рабочей папки, посмотреть хвост). Если упали чужие тесты, починить по смыслу и записать `Ruling:` в журнал. Затем `npx tsc --noEmit` и `npx biome check --write .`.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(classes): the cycle works out the class; the HUD, stats and state show it

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Данные инструментов, документация, полная проверка

**Files:**
- Modify: `src/tools/register.ts` (`dataOf`: поле `class`)
- Modify: `ПЛАН.md` (строка статуса)
- Test: `tests/server/tools.test.ts` (вернуть `home` из `connect()`, новый тест)

**Interfaces:**
- Consumes: `ProjectView.playerClass` (задача 3); `className`, `classLabel` (задача 2).
- Produces: в `structuredContent` каждого инструмента, который использует `answer()`, поле `class: null | { name: string; shares: { id: string; name: string; percent: number }[]; stats: string[] }`.

- [ ] **Step 1: Write the failing test**

В `tests/server/tools.test.ts`: в `connect()` вынести `const home = await makeTempDir();` в переменную и вернуть её (`return { project, client, call, home };`), а в `createServer` передать `home`. Добавить в импорты `import { readdir } from 'node:fs/promises';` (рядом с `rm`) и `import { appendEvents } from '../../src/storage/journal.js';`. Добавить тест в `describe('tools', ...)`:

```ts
  it('get_project_state shows the class of the project and puts it into the data, and says null before', async () => {
    const { call, home } = await connect();
    const before = await call('get_project_state');
    expect(before.structuredContent).toMatchObject({ class: null });
    expect(text(before)).not.toContain('Class:');

    const [id] = await readdir(path.join(home, 'projects'));
    const at = new Date().toISOString();
    const done = (name: string) => ({
      at,
      type: 'quest_completed' as const,
      data: { id: name, category: 'testing', difficulty: 'easy', xp: 10 },
    });
    await appendEvents(path.join(home, 'projects', String(id), 'events.jsonl'), [done('a'), done('b'), done('c')]);
    const after = await call('get_project_state');
    expect(text(after)).toContain('Class: Tester (Tester 100%)');
    expect(after.structuredContent).toMatchObject({
      class: { name: 'Tester', shares: [{ id: 'tester', name: 'Tester', percent: 100 }], stats: ['testing'] },
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/tools.test.ts -t "class of the project"`
Expected: FAIL (в `structuredContent` нет поля `class`).

- [ ] **Step 3: Write minimal implementation**

В `src/tools/register.ts`: импорт `import { classLabel, className } from '../hud/classes.js';`; в `dataOf` в возвращаемый объект добавить:

```ts
    class:
      view.playerClass === null
        ? null
        : {
            name: className(view.playerClass, view.lang),
            shares: view.playerClass.shares.map((item) => ({
              id: item.id,
              name: classLabel(item.id, view.lang),
              percent: Math.round(item.share * 100),
            })),
            stats: [...view.playerClass.stats],
          },
```

В `ПЛАН.md` в строку статуса после фразы про достижения добавить: «Фаза 2, часть 3 готова: классы (6 классов и гибриды по доле проверенной работы, название в HUD и звёздочки у статов; спецификация `docs/superpowers/specs/2026-10-02-codequest-classes-design.md`).»

- [ ] **Step 4: Run tests to verify they pass, then the whole check**

Run: `npx vitest run tests/server` → PASS.
Run: `npm run check` (3–5 минут; вывод в файл, посмотреть хвост). Expected: typecheck, lint и все тесты зелёные.
Run: `npm run build` — пересобрать `dist`.

- [ ] **Step 5: Commit**

```bash
git add src/tools/register.ts tests/server ПЛАН.md
git commit -m "feat(classes): the class in the data of the tools

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

После коммита сообщить пользователю: что сделано, реальное число тестов, что не проверено вживую (вид HUD с классом и звёздочками на живой доске; у проекта пользователя класс появится, когда будет не меньше 3 закрытых квестов в категориях классов), и что для обновления нужно закрыть доску (Q) и перезапустить MCP-сервер.
