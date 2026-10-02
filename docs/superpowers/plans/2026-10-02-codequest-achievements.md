# CodeQuest: достижения — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 11 достижений за реальные вехи: событие `achievement_unlocked` пишется один раз, видно в уведомлениях, истории и инструменте `get_achievements`; XP не меняется.

**Architecture:** Каталог, счётчики и вычисление в одном файле `src/game/achievements.ts` (чистые функции над событиями журнала). В конце полного цикла `runCycle` дописывает события для новых достижений. Тексты — в `src/hud/achievements.ts` и каталогах i18n; `Engine.achievements` читает журнал; инструмент — тонкая обёртка.

**Tech Stack:** TypeScript (strict), Vitest, Biome, `@modelcontextprotocol/sdk`.

**Spec:** `docs/superpowers/specs/2026-10-02-codequest-achievements-design.md`

## Global Constraints

- Достижения не дают XP; формулы XP и уровней не менять.
- Каталог ровно из 11 достижений с id, целями и условиями из таблицы спецификации §2: `first-quest` 1, `quests-10` 10, `quests-50` 50, `green-run` 1, `level-5` 5, `level-10` 10, `level-25` 25, `secret-keeper` 1, `hard-mode` 1, `epic-finish` 1, `jack-of-all-trades` 5.
- Условия считаются только по событиям журнала `quest_completed`, `xp` (с `topUp`), `level_up`; журнал — единственный источник правды, нового хранилища нет.
- Событие `achievement_unlocked` с `data: { id }` пишется один раз на достижение; быстрый путь цикла (кэш без изменений) ничего не пишет.
- Тексты на ru и en; у каждого ключа одинаковые плейсхолдеры (проверяет `tests/i18n/i18n.test.ts`).
- Новый MCP-инструмент только читает (`readOnlyHint`). Тесты, перечисляющие инструменты по именам (`tests/server/server.test.ts`, `tests/server/tools.test.ts`), обновить на новое число.
- Автор коммитов `aleks-fw`, в конце сообщения строка `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Push не делать.
- Править файлы через Edit/Write, не через heredoc с обратными слэшами. Полный `npm run check` занимает 3–5 минут. Если новое событие ломает чужие тесты (счёт событий, строки уведомлений), чинить тест по смыслу и записывать в журнал плана как `Ruling:`.

## Review Focus

1. Ровно на пороге: 9 закрытых квестов — «Десяток» не открыт, 10 — открыт. Задача 1.
2. События с неверными типами данных (`xp: "lots"`, `to: null`, `category: 5`): считаются как 0 или пропускаются, подсчёт не падает. Задача 1.
3. Квест без `category`: идёт в «закрыто всего», но не в разнообразие категорий. Задача 1.
4. Квест закрыт и порог пройден в одном цикле: события текущего цикла (без `seq`) учитываются, достижение открывается в этом же цикле. Задачи 1 и 3.
5. Повторный полный цикл и повторный вызов `newlyUnlocked` не дают дублей. Задачи 1 и 3.
6. `achievement_unlocked` с неизвестным `id` (из будущей версии) в журнале: не ломает `get_achievements`, не показывается в нём, а в уведомлении и истории выводится по `id`. Задачи 1, 2 и 4.

---

### Task 1: Ядро — каталог, счётчики, вычисление

**Files:**
- Create: `src/game/achievements.ts`
- Modify: `src/types.ts` (в `EventType` добавить `'achievement_unlocked'`)
- Modify: `docs/superpowers/specs/2026-10-02-codequest-achievements-design.md` (§3: путь `src/game/achievements.ts` вместо папки)
- Test: `tests/game/achievements.test.ts`

**Interfaces:**
- Consumes: `EventType`, `ProjectRef` из `src/types.ts`; `NewEvent` из `src/storage/journal.ts`; `Lang` из `src/i18n/index.ts`.
- Produces (используют задачи 2–4):
  - `interface JournalEvent { type: EventType; at?: string; data?: Record<string, unknown> }` (подходит и `GameEvent`, и `NewEvent`)
  - `interface Counters { completed; categories; maxLevel; green; secret; hard; epic: number }`
  - `interface AchievementDef { id: string; goal: number; value: (counters: Counters) => number }`
  - `const ACHIEVEMENTS: readonly AchievementDef[]` (11 штук в порядке таблицы)
  - `counters(events: readonly JournalEvent[]): Counters`
  - `interface AchievementStatus { id: string; value: number; goal: number; unlockedAt?: string }`
  - `evaluate(events: readonly JournalEvent[]): AchievementStatus[]` — по одному на достижение каталога, в порядке каталога
  - `newlyUnlocked(events: readonly JournalEvent[], at: string): NewEvent[]`
  - `interface AchievementsView { project: ProjectRef; lang: Lang; items: AchievementStatus[] }`

- [ ] **Step 1: Write the failing test**

Создать `tests/game/achievements.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, counters, evaluate, type JournalEvent, newlyUnlocked } from '../../src/game/achievements.js';
import type { EventType } from '../../src/types.js';

const at = '2026-10-02T10:00:00.000Z';
const ev = (type: EventType, data: Record<string, unknown> = {}, when = at): JournalEvent => ({ type, at: when, data });
const done = (data: Record<string, unknown> = {}): JournalEvent => ev('quest_completed', { xp: 10, ...data });
const many = (n: number, data: Record<string, unknown> = {}): JournalEvent[] =>
  Array.from({ length: n }, () => done(data));
const ids = (events: JournalEvent[]): string[] => newlyUnlocked(events, at).map((event) => String(event.data?.id));

describe('counters', () => {
  it('counts completions, categories, levels, green runs and the special quests', () => {
    const c = counters([
      done({ category: 'bug', difficulty: 'easy', factor: 0.8 }),
      done({ category: 'bug', difficulty: 'hard', factor: 1, template: 'remove-hardcoded-secret' }),
      done({ category: 'security', difficulty: 'epic' }),
      ev('xp', { amount: 20, topUp: 'a' }),
      ev('xp', { amount: 80, quest: 'a' }),
      ev('level_up', { from: 1, to: 2 }),
      ev('level_up', { from: 2, to: 3 }),
      ev('analysis'),
    ]);
    expect(c).toEqual({ completed: 3, categories: 2, maxLevel: 3, green: 2, secret: 1, hard: 1, epic: 1 });
  });

  it('wrong-typed data counts as nothing, and a quest without a category is not a category', () => {
    const c = counters([
      done({ category: 5, difficulty: 7, factor: 'x' }),
      done({}),
      ev('xp', { amount: 'lots', topUp: 3 }),
      ev('level_up', { from: 'a', to: null }),
    ]);
    expect(c).toEqual({ completed: 2, categories: 0, maxLevel: 0, green: 0, secret: 0, hard: 0, epic: 0 });
  });
});

describe('evaluate', () => {
  it('lists the 11 achievements of the catalog with their value and goal', () => {
    expect(ACHIEVEMENTS.map((def) => def.id)).toEqual([
      'first-quest',
      'quests-10',
      'quests-50',
      'green-run',
      'level-5',
      'level-10',
      'level-25',
      'secret-keeper',
      'hard-mode',
      'epic-finish',
      'jack-of-all-trades',
    ]);
    const items = evaluate(many(3, { category: 'bug' }));
    expect(items).toHaveLength(11);
    expect(items.find((item) => item.id === 'quests-10')).toEqual({ id: 'quests-10', value: 3, goal: 10 });
    expect(items.find((item) => item.id === 'jack-of-all-trades')).toEqual({
      id: 'jack-of-all-trades',
      value: 1,
      goal: 5,
    });
  });

  it('takes unlockedAt from the first unlock event and ignores ids it does not know', () => {
    const items = evaluate([
      done(),
      ev('achievement_unlocked', { id: 'first-quest' }, '2026-10-01T09:00:00.000Z'),
      ev('achievement_unlocked', { id: 'first-quest' }, '2026-10-02T09:00:00.000Z'),
      ev('achievement_unlocked', { id: 'from-the-future' }),
    ]);
    expect(items).toHaveLength(11);
    expect(items.find((item) => item.id === 'first-quest')?.unlockedAt).toBe('2026-10-01T09:00:00.000Z');
    expect(items.find((item) => item.id === 'quests-10')?.unlockedAt).toBeUndefined();
  });
});

describe('newlyUnlocked', () => {
  it('opens a quest-count achievement exactly at its goal', () => {
    expect(ids(many(9))).toEqual(['first-quest']);
    expect(ids(many(10))).toEqual(['first-quest', 'quests-10']);
    expect(ids(many(50))).toEqual(['first-quest', 'quests-10', 'quests-50']);
  });

  it('writes events with the time given and the id of the achievement', () => {
    expect(newlyUnlocked(many(1), '2026-10-03T00:00:00.000Z')).toEqual([
      { at: '2026-10-03T00:00:00.000Z', type: 'achievement_unlocked', data: { id: 'first-quest' } },
    ]);
  });

  it('never opens an achievement twice: unlock events already in the journal are skipped', () => {
    const journal = [...many(10), ev('achievement_unlocked', { id: 'first-quest' })];
    expect(ids(journal)).toEqual(['quests-10']);
    const all = [...journal, ev('achievement_unlocked', { id: 'quests-10' })];
    expect(ids(all)).toEqual([]);
  });

  it('counts the events of the current cycle, which have no seq yet, together with the journal', () => {
    const journal = many(9);
    const cycle = [done(), ev('level_up', { from: 4, to: 5 })];
    expect(ids([...journal, ...cycle])).toEqual(['first-quest', 'quests-10', 'level-5']);
  });

  it('opens the other kinds on their conditions, and nothing on an empty journal', () => {
    expect(ids([])).toEqual([]);
    expect(ids([ev('level_up', { from: 9, to: 10 })])).toEqual(['level-5', 'level-10']);
    expect(ids([done({ factor: 1 })])).toEqual(['first-quest', 'green-run']);
    expect(ids([ev('xp', { amount: 20, topUp: 'a' })])).toEqual(['green-run']);
    expect(ids([done({ template: 'remove-hardcoded-secret', difficulty: 'hard' })])).toEqual([
      'first-quest',
      'secret-keeper',
      'hard-mode',
    ]);
    expect(ids([done({ difficulty: 'epic' })])).toEqual(['first-quest', 'epic-finish']);
    const categories = ['bug', 'testing', 'security', 'cleanup', 'architecture'].map((category) => done({ category }));
    expect(ids(categories.slice(0, 4))).toEqual(['first-quest']);
    expect(ids(categories)).toEqual(['first-quest', 'jack-of-all-trades']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/achievements.test.ts`
Expected: FAIL, не найден модуль `../../src/game/achievements.js`.

- [ ] **Step 3: Write minimal implementation**

3a. В `src/types.ts` в тип `EventType` добавить `| 'achievement_unlocked'` (после `'settings_changed'`).

3b. Создать `src/game/achievements.ts`:

```ts
import type { Lang } from '../i18n/index.js';
import type { NewEvent } from '../storage/journal.js';
import type { EventType, ProjectRef } from '../types.js';

/** A journal event, or one of the current cycle (it has no `seq` yet; only the type, time and data matter here). */
export interface JournalEvent {
  type: EventType;
  at?: string;
  data?: Record<string, unknown>;
}

/** What the conditions of the achievements are computed from (spec §3). */
export interface Counters {
  completed: number;
  /** Different categories among the completed quests. */
  categories: number;
  /** The highest level reached, from the `level_up` events. */
  maxLevel: number;
  /** Quests completed at factor 1 plus top-ups: work a green run of the project commands confirmed. */
  green: number;
  secret: number;
  hard: number;
  epic: number;
}

export interface AchievementDef {
  id: string;
  goal: number;
  value: (counters: Counters) => number;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first-quest', goal: 1, value: (c) => c.completed },
  { id: 'quests-10', goal: 10, value: (c) => c.completed },
  { id: 'quests-50', goal: 50, value: (c) => c.completed },
  { id: 'green-run', goal: 1, value: (c) => c.green },
  { id: 'level-5', goal: 5, value: (c) => c.maxLevel },
  { id: 'level-10', goal: 10, value: (c) => c.maxLevel },
  { id: 'level-25', goal: 25, value: (c) => c.maxLevel },
  { id: 'secret-keeper', goal: 1, value: (c) => c.secret },
  { id: 'hard-mode', goal: 1, value: (c) => c.hard },
  { id: 'epic-finish', goal: 1, value: (c) => c.epic },
  { id: 'jack-of-all-trades', goal: 5, value: (c) => c.categories },
];

export interface AchievementStatus {
  id: string;
  value: number;
  goal: number;
  /** The time of the first `achievement_unlocked` event of this id. */
  unlockedAt?: string;
}

/** What `Engine.achievements` returns and the texts are drawn from. */
export interface AchievementsView {
  project: ProjectRef;
  lang: Lang;
  /** One per achievement of the catalog, in the order of the catalog. */
  items: AchievementStatus[];
}

const number = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

export function counters(events: readonly JournalEvent[]): Counters {
  const result: Counters = { completed: 0, categories: 0, maxLevel: 0, green: 0, secret: 0, hard: 0, epic: 0 };
  const categories = new Set<string>();
  for (const event of events) {
    const data = event.data ?? {};
    if (event.type === 'quest_completed') {
      result.completed++;
      if (typeof data.category === 'string' && data.category !== '') categories.add(data.category);
      if (data.factor === 1) result.green++;
      if (data.template === 'remove-hardcoded-secret') result.secret++;
      if (data.difficulty === 'hard') result.hard++;
      if (data.difficulty === 'epic') result.epic++;
    } else if (event.type === 'xp') {
      if (typeof data.topUp === 'string') result.green++;
    } else if (event.type === 'level_up') {
      result.maxLevel = Math.max(result.maxLevel, number(data.to));
    }
  }
  result.categories = categories.size;
  return result;
}

/** The time of the first unlock event of each id. */
function unlockTimes(events: readonly JournalEvent[]): Map<string, string> {
  const times = new Map<string, string>();
  for (const event of events) {
    const id = event.data?.id;
    if (event.type === 'achievement_unlocked' && typeof id === 'string' && !times.has(id)) times.set(id, event.at ?? '');
  }
  return times;
}

/** Every achievement of the catalog with its value, its goal and, if it was opened, the time. */
export function evaluate(events: readonly JournalEvent[]): AchievementStatus[] {
  const c = counters(events);
  const times = unlockTimes(events);
  return ACHIEVEMENTS.map((def) => {
    const status: AchievementStatus = { id: def.id, value: def.value(c), goal: def.goal };
    const unlockedAt = times.get(def.id);
    if (unlockedAt !== undefined) status.unlockedAt = unlockedAt;
    return status;
  });
}

/**
 * The `achievement_unlocked` events still to be written: the goal is reached and the journal has no event of that id
 * yet. Pass the journal and the events of the current cycle together; calling it again after they were written gives [].
 */
export function newlyUnlocked(events: readonly JournalEvent[], at: string): NewEvent[] {
  const c = counters(events);
  const times = unlockTimes(events);
  return ACHIEVEMENTS.filter((def) => def.value(c) >= def.goal && !times.has(def.id)).map(
    (def): NewEvent => ({ at, type: 'achievement_unlocked', data: { id: def.id } }),
  );
}
```

3c. В спецификации §3 заменить `src/game/achievements/catalog.ts` на `src/game/achievements.ts` (один файл вместо папки).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/game/achievements.test.ts`
Expected: PASS. Затем `npx tsc --noEmit` (если где-то есть исчерпывающий `switch` по `EventType`, поправить его: он покажет ошибку) и `npx biome check --write .`.

- [ ] **Step 5: Commit**

```bash
git add src/game/achievements.ts src/types.ts tests/game/achievements.test.ts docs/superpowers/specs/2026-10-02-codequest-achievements-design.md
git commit -m "feat(achievements): catalog, counters and the unlock rule

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Тексты — каталоги, строки, уведомление, история

**Files:**
- Create: `src/hud/achievements.ts`
- Modify: `src/i18n/en.ts`, `src/i18n/ru.ts` (после блока `history.*`)
- Modify: `src/game/history.ts` (экспорт `localDateOf`; `achievement_unlocked` — веха)
- Modify: `src/hud/notifications.ts` (строка для `achievement_unlocked`)
- Modify: `docs/superpowers/specs/2026-10-02-codequest-history-design.md` (§2: шестая веха)
- Test: `tests/hud/achievements.test.ts`, `tests/game/history.test.ts` (добавить проверку)

**Interfaces:**
- Consumes: `AchievementsView`, `AchievementStatus`, `ACHIEVEMENTS` (задача 1); `t`, `Lang`.
- Produces:
  - `achievementName(id: string, lang: Lang): string` — название, а для неизвестного `id` сам `id`
  - `achievementDescription(id: string, lang: Lang): string | undefined`
  - `achievementLine(id: string, lang: Lang): string` — строка уведомления/истории
  - `orderAchievements(items: readonly AchievementStatus[]): AchievementStatus[]` — полученные (новые выше), затем остальные в порядке каталога
  - `achievementsText(view: AchievementsView): string`
  - `localDateOf(at: string): string` в `src/game/history.ts` (локальная дата `YYYY-MM-DD`, пустая строка для битой даты)

- [ ] **Step 1: Write the failing tests**

Создать `tests/hud/achievements.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { type AchievementsView, evaluate, type JournalEvent } from '../../src/game/achievements.js';
import { achievementLine, achievementsText, orderAchievements } from '../../src/hud/achievements.js';
import { notificationLine } from '../../src/hud/notifications.js';
import type { Lang } from '../../src/i18n/index.js';
import type { EventType, GameEvent } from '../../src/types.js';

const local = (day: number, hour: number): string => new Date(2026, 9, day, hour, 0).toISOString();
const ev = (type: EventType, at: string, data: Record<string, unknown> = {}): JournalEvent => ({ type, at, data });

const view = (lang: Lang, events: JournalEvent[]): AchievementsView => ({
  project: { id: 'x', name: 'shop', root: '/shop' },
  lang,
  items: evaluate(events),
});

const ONE = [
  ev('quest_completed', local(2, 10), { xp: 80 }),
  ev('achievement_unlocked', local(2, 11), { id: 'first-quest' }),
];

describe('achievementsText', () => {
  it('lists the earned ones with the date and the rest with their progress, in English', () => {
    const lines = achievementsText(view('en', ONE)).split('\n');
    expect(lines).toHaveLength(12);
    expect(lines[0]).toBe('ACHIEVEMENTS · shop · 1/11');
    expect(lines[1]).toBe('🏆 First Step · Close your first quest. · 2026-10-02');
    expect(lines[2]).toBe('🔒 Ten Down · Close 10 quests. · 1/10');
    expect(lines.at(-1)).toContain('🔒 Jack of All Trades');
  });

  it('speaks Russian when the language is Russian', () => {
    const lines = achievementsText(view('ru', ONE)).split('\n');
    expect(lines[0]).toBe('ДОСТИЖЕНИЯ · shop · 1/11');
    expect(lines[1]).toBe('🏆 Первый шаг · Закрыть первый квест. · 2026-10-02');
    expect(lines[2]).toBe('🔒 Десяток · Закрыть 10 квестов. · 1/10');
  });

  it('shows a goal that is reached but not yet opened as full progress, not above it', () => {
    const events = Array.from({ length: 12 }, () => ev('quest_completed', local(2, 10), {}));
    expect(achievementsText(view('en', events))).toContain('🔒 Ten Down · Close 10 quests. · 10/10');
  });
});

describe('orderAchievements', () => {
  it('puts the newest earned first, then the rest in the order of the catalog', () => {
    const events = [
      ev('quest_completed', local(1, 9), {}),
      ev('achievement_unlocked', local(1, 9), { id: 'first-quest' }),
      ev('level_up', local(2, 9), { from: 4, to: 5 }),
      ev('achievement_unlocked', local(2, 9), { id: 'level-5' }),
    ];
    const order = orderAchievements(evaluate(events)).map((item) => item.id);
    expect(order.slice(0, 2)).toEqual(['level-5', 'first-quest']);
    expect(order[2]).toBe('quests-10');
    expect(order).toHaveLength(11);
  });
});

describe('the line of an unlocked achievement', () => {
  const unlocked = (id: string): GameEvent => ({
    seq: 1,
    at: local(2, 11),
    type: 'achievement_unlocked',
    data: { id },
  });

  it('is the same in the notifications, in both languages', () => {
    expect(notificationLine(unlocked('first-quest'), 'en')).toBe('🏆 Achievement: First Step — Close your first quest.');
    expect(notificationLine(unlocked('first-quest'), 'ru')).toBe('🏆 Достижение: Первый шаг — Закрыть первый квест.');
    expect(achievementLine('first-quest', 'en')).toBe(notificationLine(unlocked('first-quest'), 'en'));
  });

  it('names an id the catalog does not know by the id itself', () => {
    expect(notificationLine(unlocked('from-the-future'), 'en')).toBe('🏆 Achievement: from-the-future');
    expect(notificationLine(unlocked('from-the-future'), 'ru')).toBe('🏆 Достижение: from-the-future');
  });
});
```

В конец `tests/game/history.test.ts` добавить:

```ts
describe('achievements in the history', () => {
  it('an unlocked achievement is a milestone of the day', () => {
    const unlocked = event('achievement_unlocked', local(2, 11), { id: 'first-quest' });
    expect(isMilestone(unlocked)).toBe(true);
    const days = buildHistory([unlocked], { now: NOW });
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ date: '2026-10-02', xp: 0, quests: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/hud/achievements.test.ts tests/game/history.test.ts`
Expected: FAIL (нет модуля `src/hud/achievements.js`; в истории `isMilestone` возвращает false).

- [ ] **Step 3: Write minimal implementation**

3a. В `src/i18n/en.ts` после ключей `history.*` добавить:

```ts
  'achievements.title': 'ACHIEVEMENTS · {project} · {done}/{total}',
  'notif.achievement': '🏆 Achievement: {name} — {description}',
  'notif.achievementPlain': '🏆 Achievement: {name}',
  'achievement.first-quest.name': 'First Step',
  'achievement.first-quest.desc': 'Close your first quest.',
  'achievement.quests-10.name': 'Ten Down',
  'achievement.quests-10.desc': 'Close 10 quests.',
  'achievement.quests-50.name': 'Fifty Strong',
  'achievement.quests-50.desc': 'Close 50 quests.',
  'achievement.green-run.name': 'Green Light',
  'achievement.green-run.desc': 'Get a quest confirmed by a green run of the project commands.',
  'achievement.level-5.name': 'Level 5',
  'achievement.level-5.desc': 'Reach level 5.',
  'achievement.level-10.name': 'Level 10',
  'achievement.level-10.desc': 'Reach level 10.',
  'achievement.level-25.name': 'Level 25',
  'achievement.level-25.desc': 'Reach level 25.',
  'achievement.secret-keeper.name': 'Secret Keeper',
  'achievement.secret-keeper.desc': 'Close a quest about a hardcoded secret.',
  'achievement.hard-mode.name': 'Hard Mode',
  'achievement.hard-mode.desc': 'Close a Hard quest.',
  'achievement.epic-finish.name': 'Epic Finish',
  'achievement.epic-finish.desc': 'Close an Epic quest.',
  'achievement.jack-of-all-trades.name': 'Jack of All Trades',
  'achievement.jack-of-all-trades.desc': 'Close quests in 5 different categories.',
```

В `src/i18n/ru.ts` после ключей `history.*`:

```ts
  'achievements.title': 'ДОСТИЖЕНИЯ · {project} · {done}/{total}',
  'notif.achievement': '🏆 Достижение: {name} — {description}',
  'notif.achievementPlain': '🏆 Достижение: {name}',
  'achievement.first-quest.name': 'Первый шаг',
  'achievement.first-quest.desc': 'Закрыть первый квест.',
  'achievement.quests-10.name': 'Десяток',
  'achievement.quests-10.desc': 'Закрыть 10 квестов.',
  'achievement.quests-50.name': 'Полсотни',
  'achievement.quests-50.desc': 'Закрыть 50 квестов.',
  'achievement.green-run.name': 'Зелёный свет',
  'achievement.green-run.desc': 'Получить подтверждение квеста зелёным прогоном команд проекта.',
  'achievement.level-5.name': 'Уровень 5',
  'achievement.level-5.desc': 'Достичь 5-го уровня.',
  'achievement.level-10.name': 'Уровень 10',
  'achievement.level-10.desc': 'Достичь 10-го уровня.',
  'achievement.level-25.name': 'Уровень 25',
  'achievement.level-25.desc': 'Достичь 25-го уровня.',
  'achievement.secret-keeper.name': 'Хранитель секретов',
  'achievement.secret-keeper.desc': 'Закрыть квест про секрет в коде.',
  'achievement.hard-mode.name': 'Сложный режим',
  'achievement.hard-mode.desc': 'Закрыть сложный квест.',
  'achievement.epic-finish.name': 'Эпический финал',
  'achievement.epic-finish.desc': 'Закрыть эпический квест.',
  'achievement.jack-of-all-trades.name': 'Мастер на все руки',
  'achievement.jack-of-all-trades.desc': 'Закрыть квесты в 5 разных категориях.',
```

3b. В `src/game/history.ts`: в `isMilestone` добавить `case 'achievement_unlocked':` к `return true`-группе; после `timeKey` добавить:

```ts
/** The local date (`YYYY-MM-DD`) of an ISO time; empty when the time is broken. */
export function localDateOf(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? '' : dateKey(date);
}
```

3c. Создать `src/hud/achievements.ts`:

```ts
import { type AchievementStatus, type AchievementsView } from '../game/achievements.js';
import { localDateOf } from '../game/history.js';
import { type Lang, t } from '../i18n/index.js';

/** A catalog text of an achievement; undefined when the catalog has none (an id from a newer version). */
function lookup(lang: Lang, id: string, part: 'name' | 'desc'): string | undefined {
  const key = `achievement.${id}.${part}`;
  const text = t(lang, key);
  return text === key ? undefined : text;
}

export const achievementName = (id: string, lang: Lang): string => lookup(lang, id, 'name') ?? id;

export const achievementDescription = (id: string, lang: Lang): string | undefined => lookup(lang, id, 'desc');

/** The line of a newly opened achievement for the notifications and the history. */
export function achievementLine(id: string, lang: Lang): string {
  const name = achievementName(id, lang);
  const description = achievementDescription(id, lang);
  return description === undefined
    ? t(lang, 'notif.achievementPlain', { name })
    : t(lang, 'notif.achievement', { name, description });
}

const unlockedAt = (item: AchievementStatus): string => item.unlockedAt ?? '';

/** The earned ones, the newest first, then the rest in the order they came in (the order of the catalog). */
export function orderAchievements(items: readonly AchievementStatus[]): AchievementStatus[] {
  const earned = items.filter((item) => item.unlockedAt !== undefined);
  earned.sort((a, b) => unlockedAt(b).localeCompare(unlockedAt(a)));
  return [...earned, ...items.filter((item) => item.unlockedAt === undefined)];
}

export function achievementsText(view: AchievementsView): string {
  const { lang } = view;
  const ordered = orderAchievements(view.items);
  const done = ordered.filter((item) => item.unlockedAt !== undefined).length;
  const lines = [t(lang, 'achievements.title', { project: view.project.name, done, total: ordered.length })];
  for (const item of ordered) {
    const name = achievementName(item.id, lang);
    const description = achievementDescription(item.id, lang) ?? '';
    lines.push(
      item.unlockedAt === undefined
        ? `🔒 ${name} · ${description} · ${Math.min(item.value, item.goal)}/${item.goal}`
        : `🏆 ${name} · ${description} · ${localDateOf(item.unlockedAt)}`,
    );
  }
  return lines.join('\n');
}
```

3d. В `src/hud/notifications.ts` добавить импорт `import { achievementLine } from './achievements.js';` и в `switch` перед `default`:

```ts
    case 'achievement_unlocked':
      return achievementLine(text(data.id), lang);
```

3e. В `docs/superpowers/specs/2026-10-02-codequest-history-design.md` в таблицу §2 добавить строку: `| `achievement_unlocked` | 🏆 полученное достижение (текст как в уведомлении) |`, а в тексте «Из событий журнала берутся пять видов» заменить на шесть, если такая фраза есть.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/hud/achievements.test.ts tests/game/history.test.ts tests/hud/history.test.ts tests/i18n`
Expected: PASS (общий тест каталогов подтверждает одинаковые ключи в ru и en). Затем `npx tsc --noEmit` и `npx biome check --write .`.

- [ ] **Step 5: Commit**

```bash
git add src/hud/achievements.ts src/hud/notifications.ts src/game/history.ts src/i18n tests/hud/achievements.test.ts tests/game/history.test.ts docs/superpowers/specs
git commit -m "feat(achievements): texts in ru and en, notification and history line

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Цикл и `Engine.achievements`

**Files:**
- Modify: `src/engine/cycle.ts` (перед `appendEvents` в конце полного цикла; импорт)
- Modify: `src/engine/index.ts` (метод `achievements`; импорты)
- Test: `tests/engine/achievements.test.ts`
- Возможно: чужие тесты, которые считают события или строки уведомлений (см. Global Constraints).

**Interfaces:**
- Consumes: `newlyUnlocked`, `evaluate`, `AchievementsView` (задача 1); существующие `readEvents`, `Engine.storeOf`.
- Produces: `Engine.achievements(request?: ProjectRequest): Promise<AchievementsView>`; событие `achievement_unlocked` в журнале.

- [ ] **Step 1: Write the failing test**

Создать `tests/engine/achievements.test.ts`:

```ts
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { appendEvents, readEvents } from '../../src/storage/journal.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

async function shop() {
  const root = await copyFixture('projects/nextjs-shop');
  const home = await makeTempDir();
  return { root, engine: new Engine({ home, cwd: root, now: () => new Date() }) };
}

const unlockedIds = async (engine: Engine, project: Parameters<Engine['storeOf']>[0]): Promise<string[]> => {
  const { events } = await readEvents(engine.storeOf(project).file('events'));
  return events.filter((event) => event.type === 'achievement_unlocked').map((event) => String(event.data.id));
};

describe('achievements in the cycle', () => {
  it('a completed quest opens First Step once, and later cycles add nothing', async () => {
    const { root, engine } = await shop();
    const first = await engine.view({});
    expect(await unlockedIds(engine, first.project)).toEqual([]);

    await rm(path.join(root, 'components', 'ProductBadge.tsx'));
    const cycle = await engine.poll();
    const fresh = cycle?.events.filter((event) => event.type === 'achievement_unlocked') ?? [];
    expect(fresh.map((event) => event.data.id)).toEqual(['first-quest']);

    await engine.refresh({}, true);
    await engine.verify({});
    expect(await unlockedIds(engine, first.project)).toEqual(['first-quest']);
  });

  it('what was earned before the achievements existed opens at the first full cycle, in the order of the catalog', async () => {
    const { engine } = await shop();
    const { project } = await engine.view({});
    const at = new Date().toISOString();
    const completed = Array.from({ length: 10 }, () => ({
      at,
      type: 'quest_completed' as const,
      data: { xp: 10, category: 'bug' },
    }));
    await appendEvents(engine.storeOf(project).file('events'), [
      ...completed,
      { at, type: 'level_up', data: { from: 4, to: 5 } },
    ]);
    const view = await engine.refresh({}, true);
    expect(view.events.filter((event) => event.type === 'achievement_unlocked').map((event) => event.data.id)).toEqual([
      'first-quest',
      'quests-10',
      'level-5',
    ]);
    expect((await engine.refresh({}, true)).events.filter((event) => event.type === 'achievement_unlocked')).toEqual([]);
  });
});

describe('Engine.achievements', () => {
  it('lists the 11 achievements of the project with their progress and what was earned', async () => {
    const { root, engine } = await shop();
    await engine.view({});
    expect((await engine.achievements({})).items.every((item) => item.unlockedAt === undefined)).toBe(true);
    await rm(path.join(root, 'components', 'ProductBadge.tsx'));
    await engine.poll();
    const view = await engine.achievements({});
    expect(view.items).toHaveLength(11);
    expect(view.lang).toBe('en');
    expect(view.items.find((item) => item.id === 'first-quest')?.unlockedAt).toBeDefined();
    expect(view.items.find((item) => item.id === 'quests-10')).toMatchObject({ value: 1, goal: 10 });
  });

  it('a project that was never looked at has nothing earned', async () => {
    const { engine } = await shop();
    const view = await engine.achievements({});
    expect(view.items).toHaveLength(11);
    expect(view.items.every((item) => item.value === 0 && item.unlockedAt === undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/achievements.test.ts`
Expected: FAIL (первый и второй тест: нет событий `achievement_unlocked`; остальные: `engine.achievements is not a function`).

- [ ] **Step 3: Write minimal implementation**

3a. В `src/engine/cycle.ts` добавить импорт `import { newlyUnlocked } from '../game/achievements.js';` и непосредственно перед строкой `const written = await appendEvents(store.file('events'), events);` вставить:

```ts
    // Achievements: what the journal and this cycle's events together have reached and the journal has not recorded yet.
    events.push(...newlyUnlocked([...loaded.events, ...events], at));
```

3b. В `src/engine/index.ts` добавить импорт `import { type AchievementsView, evaluate } from '../game/achievements.js';` и метод рядом с `history`:

```ts
  /**
   * Every achievement of the catalog with its progress and, if earned, the time: read from the journal alone, like
   * `history`. Opening new ones is the cycle's job, so this never writes.
   */
  async achievements(request: ProjectRequest = {}): Promise<AchievementsView> {
    const project = await this.resolve(request);
    const { events } = await readEvents(this.storeOf(project).file('events'));
    return { project, lang: await this.language(), items: evaluate(events) };
  }
```

- [ ] **Step 4: Run tests to verify they pass, then the whole suite**

Run: `npx vitest run tests/engine/achievements.test.ts` → PASS.
Run: `npm test` (около 3 минут; вывод в файл рабочей папки и посмотреть хвост). Если упали чужие тесты из-за новых событий или строк `🏆` в уведомлениях: починить тест по смыслу (не ослаблять проверку, а учесть событие), записать `Ruling:` в журнал плана. Затем `npx tsc --noEmit` и `npx biome check --write .`.

- [ ] **Step 5: Commit**

```bash
git add src/engine tests
git commit -m "feat(achievements): the cycle opens new achievements; Engine.achievements

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: MCP-инструмент `get_achievements`, документация, полная проверка

**Files:**
- Modify: `src/tools/register.ts` (инструмент после `get_project_history`; импорт)
- Modify: `tests/server/server.test.ts`, `tests/server/tools.test.ts` (число и имена инструментов; новый тест)
- Modify: `ПЛАН.md` (строка статуса)

**Interfaces:**
- Consumes: `Engine.achievements` (задача 3); `achievementsText`, `orderAchievements`, `achievementName`, `achievementDescription` (задача 2); `PROJECT_PATH`, `READ_ONLY`, `fail` из `register.ts`.
- Produces: MCP-инструмент `get_achievements` (`project_path?`); `structuredContent`: `{ project, unlocked, total, items: [{ id, name, description, value, goal, unlockedAt? }] }` в порядке `orderAchievements`.

- [ ] **Step 1: Write the failing test**

В `tests/server/tools.test.ts` добавить в `describe('tools', ...)` после теста `get_project_history`:

```ts
  it('get_achievements shows what was earned and the progress of the rest', async () => {
    const { call, project } = await connect();
    await call('get_project_state');
    const before = await call('get_achievements');
    expect(before.isError).toBeFalsy();
    expect(text(before)).toContain('ACHIEVEMENTS');
    expect(text(before)).toContain('0/11');
    expect(before.structuredContent).toMatchObject({ unlocked: 0, total: 11 });

    await rm(path.join(project, 'components', 'ProductBadge.tsx'));
    await call('verify_quest_completion', { quest_id: 'Clean Inventory' });
    const after = await call('get_achievements');
    expect(text(after)).toContain('1/11');
    expect(text(after)).toContain('🏆 First Step · Close your first quest.');
    expect(text(after)).toContain('🔒 Ten Down · Close 10 quests. · 1/10');
    const data = after.structuredContent as { unlocked: number; items: { id: string; unlockedAt?: string }[] };
    expect(data.unlocked).toBe(1);
    expect(data.items[0]).toMatchObject({ id: 'first-quest' });
    expect(data.items[0]?.unlockedAt).toBeDefined();
    expect(data.items).toHaveLength(11);
  });
```

Обновить тесты со списком инструментов: в `tests/server/tools.test.ts` в тесте `set_language ...` `toHaveLength(11)` → `toHaveLength(12)` и в `arrayContaining([...])` добавить `'get_achievements'`; в `tests/server/server.test.ts` в тест со списком инструментов добавить `'get_achievements'` (первым по алфавиту: перед `'get_active_quests'`? сортировка: `get_achievements` < `get_active_quests`, потому что `ach` < `act`) и поправить название теста.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/server`
Expected: FAIL (инструмента `get_achievements` нет; обновлённые списки не совпадают).

- [ ] **Step 3: Write minimal implementation**

В `src/tools/register.ts` добавить импорт:

```ts
import { achievementDescription, achievementName, achievementsText, orderAchievements } from '../hud/achievements.js';
```

и после регистрации `get_project_history`:

```ts
  server.registerTool(
    'get_achievements',
    {
      title: 'Get achievements',
      description:
        'Show the achievements of a project: the earned ones with the date, and the rest with their progress (for example 7/10 quests). Achievements are memories of milestones and give no XP. Read-only.',
      inputSchema: { project_path: PROJECT_PATH },
      annotations: READ_ONLY,
    },
    async ({ project_path }) => {
      try {
        const view = await engine.achievements({ projectPath: project_path });
        const items = orderAchievements(view.items);
        return {
          content: [{ type: 'text', text: achievementsText(view) }],
          structuredContent: {
            project: { ...view.project },
            unlocked: items.filter((item) => item.unlockedAt !== undefined).length,
            total: items.length,
            items: items.map((item) => ({
              id: item.id,
              name: achievementName(item.id, view.lang),
              description: achievementDescription(item.id, view.lang) ?? '',
              value: item.value,
              goal: item.goal,
              ...(item.unlockedAt === undefined ? {} : { unlockedAt: item.unlockedAt }),
            })),
          },
        };
      } catch (error) {
        return await fail(error);
      }
    },
  );
```

В `ПЛАН.md` в строку статуса после фразы про историю добавить: «Фаза 2, часть 2 готова: достижения (11 штук, `get_achievements`, уведомление при получении; спецификация `docs/superpowers/specs/2026-10-02-codequest-achievements-design.md`).»

- [ ] **Step 4: Run tests to verify they pass, then the whole check**

Run: `npx vitest run tests/server` → PASS.
Run: `npm run check` (3–5 минут; вывод в файл, посмотреть хвост). Expected: typecheck, lint и все тесты зелёные.
Run: `npm run build` — пересобрать `dist`.

- [ ] **Step 5: Commit**

```bash
git add src/tools/register.ts tests/server ПЛАН.md
git commit -m "feat(achievements): get_achievements MCP tool

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

После коммита сообщить пользователю: что сделано, реальное число тестов, что не проверено вживую (вызов из настоящей сессии Claude и вид уведомления на живой доске), что для нового инструмента нужно перезапустить MCP-сервер и закрыть доску (Q), и что заработанное раньше откроется при первом полном цикле (V или R).
