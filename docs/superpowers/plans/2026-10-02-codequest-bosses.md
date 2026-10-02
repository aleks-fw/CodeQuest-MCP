# CodeQuest: боссы — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 7 боссов по темам находок: события «появился» и «побеждён» в журнале, уведомления, строки в истории, инструмент `get_project_bosses`, достижение «Убийца боссов». Без XP.

**Architecture:** Чистые функции `bossEvents` и `evaluateBosses` в `src/game/bosses.ts` (над находками снимка, журналом и квестами). Полный цикл дописывает события (как с достижениями); `Engine.bosses` читает вид; тексты в `src/hud/bosses.ts`; инструмент — тонкая обёртка.

**Tech Stack:** TypeScript (strict), Vitest, Biome, `@modelcontextprotocol/sdk`.

**Spec:** `docs/superpowers/specs/2026-10-02-codequest-bosses-design.md`

## Global Constraints

- Каталог ровно из 7 боссов с правилами и порогами из спецификации §2: `dark-forest` (`generic/untested-module`, 8), `graveyard` (`generic/unused-file`, 6), `clone-army` (`generic/duplicate-block`, 5), `secret-leak` (`generic/hardcoded-secret`, `generic/env-tracked`, 3), `blind-spots` (`generic/empty-catch`, `py/bare-except`, `bot/no-error-handler`, `bot/no-timeout`, 5), `breach` (`js/dangerous-html`, `js/eval`, `py/eval`, `shop/webhook-no-signature`, `bot/admin-no-check`, 4), `todo-swamp` (`generic/todo`, 10). Правила у разных боссов не пересекаются.
- Бой: `boss_spawned {id, hp}` пишется, когда активного боя нет и находок ≥ порога; `boss_defeated {id}` — когда бой активен и находок 0; за один вызов не больше одного события на босса. Активный бой определяется по журналу (последнее событие босса — `boss_spawned`).
- Только отметки: XP, доску квестов, класс и формулы не менять. Быстрый путь цикла (кэш без изменений) ничего не пишет.
- Достижение `boss-slayer` — 12-е, в конце каталога достижений; цель 1; значение — число `boss_defeated` в журнале. Все тесты с жёсткими числами (11 достижений, 12 инструментов) обновить.
- Тексты на ru и en; у каждого ключа одинаковые плейсхолдеры (`tests/i18n/i18n.test.ts`).
- Автор коммитов `aleks-fw`, в конце сообщения строка `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Push не делать.
- Править файлы через Edit/Write, не через heredoc/Python с обратными слэшами (они превращаются в настоящие переводы строк); `sed` по одной строке допустим. Полный `npm run check` — 3–5 минут.

## Review Focus

1. Ровно порог (6 неиспользуемых файлов) — бой начинается, порог−1 — нет. Задача 1.
2. Бой жив, пока находок от 1 до порога−1; побеждён только на нуле. Задача 1.
3. Повторный вызов и повторный полный цикл не дают дублей; один босс — максимум одно событие за вызов. Задачи 1 и 4.
4. Находок стало больше максимума: HP не показывается выше 100%. Задачи 1 и 2.
5. Событие босса без `id` или с `id` не из каталога: ничего не ломает, в уведомлениях показывается `id`. Задачи 1 и 2.
6. Проблемы вернулись после победы: начинается новый бой, достижение не дублируется. Задачи 1 и 4.
7. Связанные квесты: учитываются подзадачи эпика, закрытые и устаревшие не считаются. Задача 1.

---

### Task 1: Ядро — каталог, `bossEvents`, `evaluateBosses`

**Files:**
- Create: `src/game/bosses.ts`
- Modify: `src/types.ts` (в `EventType` добавить `'boss_spawned'` и `'boss_defeated'`)
- Test: `tests/game/bosses.test.ts`

**Interfaces:**
- Consumes: `Finding`, `Quest`, `ProjectRef`, `EventType` из `src/types.ts`; `NewEvent` из `src/storage/journal.ts`; `Lang` из `src/i18n/index.js`.
- Produces (используют задачи 2–5):
  - `interface BossDef { id: string; rules: readonly string[]; threshold: number }` и `const BOSSES: readonly BossDef[]` (в порядке таблицы)
  - `interface BossEventLike { type: string; at?: string; data?: Record<string, unknown> }`
  - `interface ActiveBoss { id: string; hp: number; max: number; spawnedAt: string; quests: number }`
  - `interface DefeatedBoss { id: string; defeatedAt: string }`
  - `interface BossBoard { active: ActiveBoss[]; defeated: DefeatedBoss[] }`
  - `interface BossesView extends BossBoard { project: ProjectRef; lang: Lang }`
  - `const MAX_DEFEATED = 10`
  - `bossEvents(findings: readonly Finding[], events: readonly BossEventLike[], at: string): NewEvent[]`
  - `evaluateBosses(findings: readonly Finding[], events: readonly BossEventLike[], quests: readonly Quest[]): BossBoard`

- [ ] **Step 1: Write the failing test**

Создать `tests/game/bosses.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BOSSES, type BossEventLike, bossEvents, evaluateBosses } from '../../src/game/bosses.js';
import type { Finding, Quest } from '../../src/types.js';

const at = '2026-10-02T10:00:00.000Z';
let n = 0;
const finding = (rule: string): Finding => ({
  id: `f${++n}`,
  rule,
  category: 'cleanup',
  severity: 'low',
  message: 'm',
  key: `k${n}`,
});
const many = (rule: string, count: number): Finding[] => Array.from({ length: count }, () => finding(rule));
const ev = (type: string, data: Record<string, unknown> = {}, when = at): BossEventLike => ({ type, at: when, data });
const quest = (findings: string[], extra: Partial<Quest> = {}): Quest =>
  ({ id: `q${++n}`, status: 'open', findings, ...extra }) as unknown as Quest;
const kinds = (events: ReturnType<typeof bossEvents>): string[] =>
  events.map((event) => `${event.type}:${String(event.data?.id)}`);

describe('the catalog', () => {
  it('has the 7 bosses, positive thresholds and no rule in two bosses', () => {
    expect(BOSSES.map((boss) => boss.id)).toEqual([
      'dark-forest',
      'graveyard',
      'clone-army',
      'secret-leak',
      'blind-spots',
      'breach',
      'todo-swamp',
    ]);
    expect(BOSSES.every((boss) => boss.threshold > 0 && boss.rules.length > 0)).toBe(true);
    const rules = BOSSES.flatMap((boss) => boss.rules);
    expect(new Set(rules).size).toBe(rules.length);
  });
});

describe('bossEvents', () => {
  it('starts a fight exactly at the threshold, not below', () => {
    expect(bossEvents(many('generic/unused-file', 5), [], at)).toEqual([]);
    expect(bossEvents(many('generic/unused-file', 6), [], at)).toEqual([
      { at, type: 'boss_spawned', data: { id: 'graveyard', hp: 6 } },
    ]);
    expect(bossEvents(many('generic/unused-file', 7), [], at)[0]?.data).toEqual({ id: 'graveyard', hp: 7 });
  });

  it('counts the findings of all the rules of a theme together', () => {
    const secrets = [...many('generic/hardcoded-secret', 2), ...many('generic/env-tracked', 1)];
    expect(kinds(bossEvents(secrets, [], at))).toEqual(['boss_spawned:secret-leak']);
    expect(bossEvents(many('generic/hardcoded-secret', 2), [], at)).toEqual([]);
  });

  it('starts several fights in the order of the catalog', () => {
    const findings = [...many('generic/unused-file', 6), ...many('generic/untested-module', 8)];
    expect(kinds(bossEvents(findings, [], at))).toEqual(['boss_spawned:dark-forest', 'boss_spawned:graveyard']);
  });

  it('does nothing while a fight is on and the findings are still there', () => {
    const journal = [ev('boss_spawned', { id: 'graveyard', hp: 7 })];
    expect(bossEvents(many('generic/unused-file', 7), journal, at)).toEqual([]);
    // Few findings left: the boss is alive until the last one is gone.
    expect(bossEvents(many('generic/unused-file', 1), journal, at)).toEqual([]);
  });

  it('ends the fight when no finding of the theme is left, once', () => {
    const journal = [ev('boss_spawned', { id: 'graveyard', hp: 7 })];
    expect(bossEvents([], journal, at)).toEqual([{ at, type: 'boss_defeated', data: { id: 'graveyard' } }]);
    const after = [...journal, ev('boss_defeated', { id: 'graveyard' })];
    expect(bossEvents([], after, at)).toEqual([]);
  });

  it('starts a new fight when the problems come back after a victory', () => {
    const after = [ev('boss_spawned', { id: 'graveyard', hp: 7 }), ev('boss_defeated', { id: 'graveyard' })];
    expect(bossEvents(many('generic/unused-file', 5), after, at)).toEqual([]);
    expect(kinds(bossEvents(many('generic/unused-file', 6), after, at))).toEqual(['boss_spawned:graveyard']);
  });

  it('is idempotent: after its events are in the journal a second call gives nothing', () => {
    const findings = many('generic/unused-file', 6);
    const first = bossEvents(findings, [], at);
    expect(bossEvents(findings, first, at)).toEqual([]);
    const done = bossEvents([], first, at);
    expect(kinds(done)).toEqual(['boss_defeated:graveyard']);
    expect(bossEvents([], [...first, ...done], at)).toEqual([]);
  });

  it('ignores events without an id and a finding of no theme', () => {
    const odd = [ev('boss_spawned', {}), ev('boss_spawned', { id: 5 }), ev('boss_defeated', { id: 'zzz' })];
    expect(kinds(bossEvents(many('generic/unused-file', 6), odd, at))).toEqual(['boss_spawned:graveyard']);
    expect(bossEvents(many('generic/failing-tests', 50), [], at)).toEqual([]);
  });
});

describe('evaluateBosses', () => {
  const spawned = (id: string, hp: number, when = at) => ev('boss_spawned', { id, hp }, when);

  it('shows the HP left and the biggest HP of the fight', () => {
    const board = evaluateBosses(many('generic/unused-file', 5), [spawned('graveyard', 12)], []);
    expect(board.active).toEqual([{ id: 'graveyard', hp: 5, max: 12, spawnedAt: at, quests: 0 }]);
    const grown = evaluateBosses(many('generic/unused-file', 9), [spawned('graveyard', 6)], []);
    expect(grown.active[0]).toMatchObject({ hp: 9, max: 9 });
  });

  it('lists only the fights that are on, and not one whose last finding is gone but not yet recorded', () => {
    expect(evaluateBosses([], [spawned('graveyard', 6)], [])).toEqual({ active: [], defeated: [] });
    expect(evaluateBosses(many('generic/unused-file', 6), [], [])).toEqual({ active: [], defeated: [] });
  });

  it('counts the open quests that have a finding of the boss, in the quest or in its subtasks', () => {
    const findings = many('generic/unused-file', 6);
    const [a, b, c] = findings;
    const other = finding('generic/todo');
    const quests = [
      quest([String(a?.id)]),
      quest([], { subtasks: [quest([String(b?.id)]), quest([other.id])] }),
      quest([String(c?.id)], { status: 'completed' }),
      quest([String(c?.id)], { status: 'obsolete' }),
      quest([other.id]),
    ];
    const board = evaluateBosses(findings, [spawned('graveyard', 6)], quests);
    expect(board.active[0]?.quests).toBe(2);
  });

  it('lists the victories newest first, at most 10, and skips ids it does not know', () => {
    const journal = [
      spawned('graveyard', 6),
      ev('boss_defeated', { id: 'graveyard' }, '2026-10-01T10:00:00.000Z'),
      spawned('dark-forest', 8),
      ev('boss_defeated', { id: 'dark-forest' }, '2026-10-02T10:00:00.000Z'),
      ev('boss_defeated', { id: 'from-the-future' }, '2026-10-03T10:00:00.000Z'),
      spawned('mystery', 5),
    ];
    expect(evaluateBosses([], journal, []).defeated).toEqual([
      { id: 'dark-forest', defeatedAt: '2026-10-02T10:00:00.000Z' },
      { id: 'graveyard', defeatedAt: '2026-10-01T10:00:00.000Z' },
    ]);
    const lots = Array.from({ length: 12 }, (_, i) =>
      ev('boss_defeated', { id: 'graveyard' }, `2026-09-${String(i + 10).padStart(2, '0')}T10:00:00.000Z`),
    );
    expect(evaluateBosses([], lots, []).defeated).toHaveLength(10);
  });

  it('does not fail on wrong-typed data', () => {
    const board = evaluateBosses(many('generic/unused-file', 6), [ev('boss_spawned', { id: 'graveyard', hp: 'x' })], []);
    expect(board.active[0]).toMatchObject({ id: 'graveyard', hp: 6, max: 6 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/bosses.test.ts`
Expected: FAIL, не найден модуль `../../src/game/bosses.js`.

- [ ] **Step 3: Write minimal implementation**

3a. В `src/types.ts` в `EventType` после `'achievement_unlocked'` добавить `| 'boss_spawned' | 'boss_defeated'`.

3b. Создать `src/game/bosses.ts`:

```ts
import type { Lang } from '../i18n/index.js';
import type { NewEvent } from '../storage/journal.js';
import type { Finding, ProjectRef, Quest } from '../types.js';

export interface BossDef {
  id: string;
  /** The scanner rules whose findings make up the boss. */
  rules: readonly string[];
  /** The fight starts when this many findings of the theme are there. */
  threshold: number;
}

/** In this order the events of one call are written and the bosses listed (spec §2). */
export const BOSSES: readonly BossDef[] = [
  { id: 'dark-forest', rules: ['generic/untested-module'], threshold: 8 },
  { id: 'graveyard', rules: ['generic/unused-file'], threshold: 6 },
  { id: 'clone-army', rules: ['generic/duplicate-block'], threshold: 5 },
  { id: 'secret-leak', rules: ['generic/hardcoded-secret', 'generic/env-tracked'], threshold: 3 },
  {
    id: 'blind-spots',
    rules: ['generic/empty-catch', 'py/bare-except', 'bot/no-error-handler', 'bot/no-timeout'],
    threshold: 5,
  },
  {
    id: 'breach',
    rules: ['js/dangerous-html', 'js/eval', 'py/eval', 'shop/webhook-no-signature', 'bot/admin-no-check'],
    threshold: 4,
  },
  { id: 'todo-swamp', rules: ['generic/todo'], threshold: 10 },
];

export const MAX_DEFEATED = 10;

/** A journal event, or one of the current cycle (it has no `seq` yet): only the type, time and data matter here. */
export interface BossEventLike {
  type: string;
  at?: string;
  data?: Record<string, unknown>;
}

export interface ActiveBoss {
  id: string;
  /** The findings of the theme that are still there. */
  hp: number;
  /** The biggest HP of this fight. */
  max: number;
  spawnedAt: string;
  /** Open quests that have a finding of this boss. */
  quests: number;
}

export interface DefeatedBoss {
  id: string;
  defeatedAt: string;
}

export interface BossBoard {
  active: ActiveBoss[];
  /** Newest first, at most `MAX_DEFEATED`. */
  defeated: DefeatedBoss[];
}

/** What `Engine.bosses` returns and the texts are drawn from. */
export interface BossesView extends BossBoard {
  project: ProjectRef;
  lang: Lang;
}

const number = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const idOf = (event: BossEventLike): string => (typeof event.data?.id === 'string' ? event.data.id : '');
const themeOf = (findings: readonly Finding[], def: BossDef): Finding[] =>
  findings.filter((finding) => def.rules.includes(finding.rule));

interface Fight {
  active: boolean;
  hp: number;
  spawnedAt: string;
}

/** The last fight of each boss, from the events in the order they happened. */
function fightsOf(events: readonly BossEventLike[]): Map<string, Fight> {
  const fights = new Map<string, Fight>();
  for (const event of events) {
    const id = idOf(event);
    if (id === '') continue;
    if (event.type === 'boss_spawned') {
      fights.set(id, { active: true, hp: number(event.data?.hp), spawnedAt: event.at ?? '' });
    } else if (event.type === 'boss_defeated') {
      const last = fights.get(id);
      fights.set(id, { active: false, hp: last?.hp ?? 0, spawnedAt: last?.spawnedAt ?? '' });
    }
  }
  return fights;
}

/**
 * The events still to be written: a fight starts when there is none and the findings of the theme reach the
 * threshold; it ends when none are left. At most one event per boss; calling it again after they were written gives [].
 * Pass the journal and the events of the current cycle together.
 */
export function bossEvents(findings: readonly Finding[], events: readonly BossEventLike[], at: string): NewEvent[] {
  const fights = fightsOf(events);
  const result: NewEvent[] = [];
  for (const def of BOSSES) {
    const count = themeOf(findings, def).length;
    const active = fights.get(def.id)?.active === true;
    if (!active && count >= def.threshold) result.push({ at, type: 'boss_spawned', data: { id: def.id, hp: count } });
    else if (active && count === 0) result.push({ at, type: 'boss_defeated', data: { id: def.id } });
  }
  return result;
}

function linkedQuests(quests: readonly Quest[], ids: ReadonlySet<string>): number {
  return quests.filter(
    (quest) =>
      quest.status === 'open' &&
      [...quest.findings, ...(quest.subtasks ?? []).flatMap((task) => task.findings)].some((id) => ids.has(id)),
  ).length;
}

/** The fights that are on (with HP and related quests) and the victories, for the tool. */
export function evaluateBosses(
  findings: readonly Finding[],
  events: readonly BossEventLike[],
  quests: readonly Quest[],
): BossBoard {
  const fights = fightsOf(events);
  const active: ActiveBoss[] = [];
  for (const def of BOSSES) {
    const fight = fights.get(def.id);
    const theme = themeOf(findings, def);
    // A fight whose last finding is gone is over; it is listed once the cycle has written the victory.
    if (fight?.active !== true || theme.length === 0) continue;
    const ids = new Set(theme.map((finding) => finding.id));
    active.push({
      id: def.id,
      hp: theme.length,
      max: Math.max(fight.hp, theme.length),
      spawnedAt: fight.spawnedAt,
      quests: linkedQuests(quests, ids),
    });
  }
  const known = new Set(BOSSES.map((def) => def.id));
  const defeated = events
    .filter((event) => event.type === 'boss_defeated' && known.has(idOf(event)))
    .map((event): DefeatedBoss => ({ id: idOf(event), defeatedAt: event.at ?? '' }))
    .reverse()
    .sort((a, b) => b.defeatedAt.localeCompare(a.defeatedAt))
    .slice(0, MAX_DEFEATED);
  return { active, defeated };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/game/bosses.test.ts`
Expected: PASS. Затем `npx tsc --noEmit` и `npx biome check --write .`.

- [ ] **Step 5: Commit**

```bash
git add src/game/bosses.ts src/types.ts tests/game/bosses.test.ts
git commit -m "feat(bosses): the catalog and the rules of the fight

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Тексты — каталоги, `hud/bosses.ts`, уведомления, история

**Files:**
- Create: `src/hud/bosses.ts`
- Modify: `src/i18n/en.ts`, `src/i18n/ru.ts` (после блока `class.*`)
- Modify: `src/hud/notifications.ts` (случаи `boss_spawned`, `boss_defeated`)
- Modify: `src/game/history.ts` (`isMilestone`)
- Modify: `docs/superpowers/specs/2026-10-02-codequest-history-design.md` (§2: две строки таблицы)
- Test: `tests/hud/bosses.test.ts`, дополнение `tests/game/history.test.ts`

**Interfaces:**
- Consumes: `BossesView`, `ActiveBoss`, `DefeatedBoss` (задача 1); `localDateOf` из `src/game/history.ts`; `t`, `Lang`.
- Produces:
  - `bossName(id: string, lang: Lang): string` — название, а для неизвестного `id` сам `id`
  - `bossDescription(id: string, lang: Lang): string | undefined`
  - `bossLine(event: { type: string; data?: Record<string, unknown> }, lang: Lang): string | null` — строка уведомления и истории; `null` без строкового `id`
  - `bossPercent(hp: number, max: number): number` — целый процент, от 0 до 100
  - `bossesText(view: BossesView): string`

- [ ] **Step 1: Write the failing tests**

Создать `tests/hud/bosses.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { BossesView } from '../../src/game/bosses.js';
import { bossesText, bossLine, bossName, bossPercent } from '../../src/hud/bosses.js';
import { notificationLine } from '../../src/hud/notifications.js';
import type { Lang } from '../../src/i18n/index.js';
import type { GameEvent } from '../../src/types.js';

const DEFEATED_AT = new Date(2026, 9, 3, 12, 0).toISOString();

const view = (lang: Lang, parts: Partial<BossesView> = {}): BossesView => ({
  project: { id: 'x', name: 'shop', root: '/shop' },
  lang,
  active: [],
  defeated: [],
  ...parts,
});

const ACTIVE = [
  { id: 'dark-forest', hp: 5, max: 12, spawnedAt: '', quests: 2 },
  { id: 'secret-leak', hp: 3, max: 3, spawnedAt: '', quests: 0 },
];

describe('bossesText', () => {
  it('lists the active bosses with HP, percent and related quests, then the defeated ones, in English', () => {
    const lines = bossesText(view('en', { active: ACTIVE, defeated: [{ id: 'graveyard', defeatedAt: DEFEATED_AT }] })).split(
      '\n',
    );
    expect(lines).toEqual([
      'BOSSES · shop',
      '⚔️ Dark Forest · 5/12 HP (42%) · related quests: 2',
      '   Modules without tests.',
      '⚔️ Secret Leak · 3/3 HP (100%) · related quests: 0',
      '   Secrets and .env in the repository.',
      '',
      'Defeated:',
      '🏆 Graveyard · 2026-10-03',
    ]);
  });

  it('speaks Russian when the language is Russian', () => {
    const lines = bossesText(view('ru', { active: ACTIVE })).split('\n');
    expect(lines[0]).toBe('БОССЫ · shop');
    expect(lines[1]).toBe('⚔️ Тёмный лес · 5/12 HP (42%) · связанных квестов: 2');
    expect(lines[2]).toBe('   Модули без тестов.');
  });

  it('says so when only victories are left, and when there is nothing', () => {
    const only = bossesText(view('en', { defeated: [{ id: 'graveyard', defeatedAt: DEFEATED_AT }] })).split('\n');
    expect(only).toEqual(['BOSSES · shop', 'No active bosses.', '', 'Defeated:', '🏆 Graveyard · 2026-10-03']);
    expect(bossesText(view('en'))).toBe('BOSSES · shop\nNo bosses: no clusters of problems.');
    expect(bossesText(view('ru')).split('\n')[1]).toBe('Боссов нет: скоплений проблем нет.');
  });

  it('shows an id it does not know by the id itself', () => {
    expect(bossName('from-the-future', 'en')).toBe('from-the-future');
  });
});

describe('bossPercent', () => {
  it('is a whole percent between 0 and 100', () => {
    expect(bossPercent(5, 12)).toBe(42);
    expect(bossPercent(9, 6)).toBe(100);
    expect(bossPercent(0, 6)).toBe(0);
    expect(bossPercent(3, 0)).toBe(0);
  });
});

describe('the lines of the notifications and the history', () => {
  const event = (type: 'boss_spawned' | 'boss_defeated', data: Record<string, unknown>): GameEvent => ({
    seq: 1,
    at: DEFEATED_AT,
    type,
    data,
  });

  it('word the start and the victory, in both languages', () => {
    const spawned = event('boss_spawned', { id: 'dark-forest', hp: 12 });
    expect(notificationLine(spawned, 'en')).toBe('⚔️ Boss appeared: Dark Forest · 12 HP');
    expect(notificationLine(spawned, 'ru')).toBe('⚔️ Появился босс: Тёмный лес · 12 HP');
    const defeated = event('boss_defeated', { id: 'graveyard' });
    expect(notificationLine(defeated, 'en')).toBe('🏆 Boss defeated: Graveyard');
    expect(notificationLine(defeated, 'ru')).toBe('🏆 Босс побеждён: Кладбище');
    expect(bossLine(defeated, 'en')).toBe(notificationLine(defeated, 'en'));
  });

  it('have no line for an event without an id, and show an unknown id as it is', () => {
    expect(notificationLine(event('boss_defeated', {}), 'en')).toBeNull();
    expect(notificationLine(event('boss_spawned', { id: '', hp: 5 }), 'en')).toBeNull();
    expect(notificationLine(event('boss_defeated', { id: 'zzz' }), 'en')).toBe('🏆 Boss defeated: zzz');
  });
});
```

В конец `tests/game/history.test.ts` добавить:

```ts
describe('bosses in the history', () => {
  it('the start and the victory of a boss are milestones of the day, an event without an id is not', () => {
    const spawned = event('boss_spawned', local(2, 9), { id: 'graveyard', hp: 6 });
    const defeated = event('boss_defeated', local(2, 11), { id: 'graveyard' });
    expect(isMilestone(spawned)).toBe(true);
    expect(isMilestone(defeated)).toBe(true);
    expect(buildHistory([spawned, defeated], { now: NOW })[0]?.entries).toHaveLength(2);
    expect(isMilestone(event('boss_defeated', local(2, 11), {}))).toBe(false);
    expect(isMilestone(event('boss_spawned', local(2, 11), { id: '' }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/hud/bosses.test.ts tests/game/history.test.ts`
Expected: FAIL (нет модуля `src/hud/bosses.js`; в истории боссы не вехи).

- [ ] **Step 3: Write minimal implementation**

3a. В `src/i18n/en.ts` после ключей `class.*` добавить:

```ts
  'boss.title': 'BOSSES · {project}',
  'boss.none': 'No bosses: no clusters of problems.',
  'boss.noActive': 'No active bosses.',
  'boss.defeatedHeader': 'Defeated:',
  'boss.related': 'related quests: {n}',
  'notif.bossSpawned': '⚔️ Boss appeared: {name} · {hp} HP',
  'notif.bossDefeated': '🏆 Boss defeated: {name}',
  'boss.dark-forest.name': 'Dark Forest',
  'boss.dark-forest.desc': 'Modules without tests.',
  'boss.graveyard.name': 'Graveyard',
  'boss.graveyard.desc': 'Files nobody uses.',
  'boss.clone-army.name': 'Clone Army',
  'boss.clone-army.desc': 'The same code copied around.',
  'boss.secret-leak.name': 'Secret Leak',
  'boss.secret-leak.desc': 'Secrets and .env in the repository.',
  'boss.blind-spots.name': 'Blind Spots',
  'boss.blind-spots.desc': 'Errors that nobody handles.',
  'boss.breach.name': 'Breach',
  'boss.breach.desc': 'Holes that let attackers in.',
  'boss.todo-swamp.name': 'TODO Swamp',
  'boss.todo-swamp.desc': 'A pile of TODO comments.',
```

В `src/i18n/ru.ts` после ключей `class.*`:

```ts
  'boss.title': 'БОССЫ · {project}',
  'boss.none': 'Боссов нет: скоплений проблем нет.',
  'boss.noActive': 'Активных боссов нет.',
  'boss.defeatedHeader': 'Побеждены:',
  'boss.related': 'связанных квестов: {n}',
  'notif.bossSpawned': '⚔️ Появился босс: {name} · {hp} HP',
  'notif.bossDefeated': '🏆 Босс побеждён: {name}',
  'boss.dark-forest.name': 'Тёмный лес',
  'boss.dark-forest.desc': 'Модули без тестов.',
  'boss.graveyard.name': 'Кладбище',
  'boss.graveyard.desc': 'Файлы, которые никто не использует.',
  'boss.clone-army.name': 'Армия клонов',
  'boss.clone-army.desc': 'Один и тот же код, скопированный повсюду.',
  'boss.secret-leak.name': 'Утечка секретов',
  'boss.secret-leak.desc': 'Секреты и .env в репозитории.',
  'boss.blind-spots.name': 'Слепые зоны',
  'boss.blind-spots.desc': 'Ошибки, которые никто не обрабатывает.',
  'boss.breach.name': 'Брешь в защите',
  'boss.breach.desc': 'Дыры, через которые можно взломать.',
  'boss.todo-swamp.name': 'Болото TODO',
  'boss.todo-swamp.desc': 'Куча комментариев TODO.',
```

3b. Создать `src/hud/bosses.ts`:

```ts
import type { BossesView } from '../game/bosses.js';
import { localDateOf } from '../game/history.js';
import { type Lang, t } from '../i18n/index.js';

/** A catalog text of a boss; undefined when the catalog has none (an id from a newer version). */
function lookup(lang: Lang, id: string, part: 'name' | 'desc'): string | undefined {
  const key = `boss.${id}.${part}`;
  const text = t(lang, key);
  return text === key ? undefined : text;
}

export const bossName = (id: string, lang: Lang): string => lookup(lang, id, 'name') ?? id;

export const bossDescription = (id: string, lang: Lang): string | undefined => lookup(lang, id, 'desc');

/** A whole percent from 0 to 100; HP above the biggest HP still shows 100%. */
export function bossPercent(hp: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((hp / max) * 100)));
}

/** The line of a started or won fight for the notifications and the history; null when the event has no id. */
export function bossLine(event: { type: string; data?: Record<string, unknown> }, lang: Lang): string | null {
  const id = event.data?.id;
  if (typeof id !== 'string' || id === '') return null;
  const name = bossName(id, lang);
  if (event.type === 'boss_spawned') {
    const hp = typeof event.data?.hp === 'number' ? event.data.hp : 0;
    return t(lang, 'notif.bossSpawned', { name, hp });
  }
  return t(lang, 'notif.bossDefeated', { name });
}

export function bossesText(view: BossesView): string {
  const { lang } = view;
  const lines = [t(lang, 'boss.title', { project: view.project.name })];
  if (view.active.length === 0 && view.defeated.length === 0) {
    lines.push(t(lang, 'boss.none'));
    return lines.join('\n');
  }
  if (view.active.length === 0) lines.push(t(lang, 'boss.noActive'));
  for (const boss of view.active) {
    const related = t(lang, 'boss.related', { n: boss.quests });
    lines.push(
      `⚔️ ${bossName(boss.id, lang)} · ${boss.hp}/${boss.max} HP (${bossPercent(boss.hp, boss.max)}%) · ${related}`,
    );
    const description = bossDescription(boss.id, lang);
    if (description !== undefined) lines.push(`   ${description}`);
  }
  if (view.defeated.length > 0) {
    lines.push('', t(lang, 'boss.defeatedHeader'));
    for (const boss of view.defeated) lines.push(`🏆 ${bossName(boss.id, lang)} · ${localDateOf(boss.defeatedAt)}`);
  }
  return lines.join('\n');
}
```

3c. В `src/hud/notifications.ts`: импорт `import { bossLine } from './bosses.js';` и в `switch` перед `default`:

```ts
    case 'boss_spawned':
    case 'boss_defeated':
      return bossLine(event, lang);
```

3d. В `src/game/history.ts` в `isMilestone` заменить ветку достижения на общую для достижений и боссов:

```ts
    case 'achievement_unlocked':
    case 'boss_spawned':
    case 'boss_defeated':
      return typeof event.data.id === 'string' && event.data.id !== '';
```

3e. В `docs/superpowers/specs/2026-10-02-codequest-history-design.md` в таблицу §2 после строки `achievement_unlocked` добавить: `| `boss_spawned` | ⚔️ появился босс (текст как в уведомлении) |` и `| `boss_defeated` | 🏆 босс побеждён (текст как в уведомлении) |`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/hud tests/game/history.test.ts tests/i18n tests/game/bosses.test.ts`
Expected: PASS. Затем `npx tsc --noEmit` и `npx biome check --write .`.

- [ ] **Step 5: Commit**

```bash
git add src/hud/bosses.ts src/hud/notifications.ts src/game/history.ts src/i18n tests/hud/bosses.test.ts tests/game/history.test.ts docs/superpowers/specs
git commit -m "feat(bosses): texts in ru and en, notification and history lines

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Достижение «Убийца боссов»

**Files:**
- Modify: `src/game/achievements.ts` (`Counters.bosses`, `counters`, 12-е достижение)
- Modify: `src/i18n/en.ts`, `src/i18n/ru.ts` (ключи `achievement.boss-slayer.*` после `achievement.jack-of-all-trades.*`)
- Modify: `docs/superpowers/specs/2026-10-02-codequest-achievements-design.md` (таблица §2: строка 12)
- Test: `tests/game/achievements.test.ts`, `tests/hud/achievements.test.ts`, `tests/engine/achievements.test.ts`, `tests/server/tools.test.ts` (числа 11 → 12)

**Interfaces:**
- Consumes: `boss_defeated` в журнале (задача 1).
- Produces: достижение `boss-slayer` (цель 1) в `ACHIEVEMENTS` последним; `Counters.bosses: number`.

- [ ] **Step 1: Update the tests so they fail**

В `tests/game/achievements.test.ts`:
- в двух `toEqual` по счётчикам добавить `bosses: 0` (в первом тесте счётчиков и во втором — оба объекта с полем `epic`: `..., epic: 1, bosses: 0 }` и `..., epic: 0, bosses: 0 }`);
- в тесте каталога заменить `lists the 11 achievements` на `lists the 12 achievements`, в список id добавить последним `'boss-slayer'`, а `toHaveLength(11)` на `toHaveLength(12)` (в двух местах: каталог и `takes unlockedAt...`);
- добавить тест в `describe('newlyUnlocked', ...)`:

```ts
  it('opens Boss Slayer at the first defeated boss, and counts the defeats', () => {
    expect(ids([ev('boss_spawned', { id: 'graveyard', hp: 6 })])).toEqual([]);
    expect(ids([ev('boss_defeated', { id: 'graveyard' })])).toEqual(['boss-slayer']);
    expect(counters([ev('boss_defeated', { id: 'a' }), ev('boss_defeated', { id: 'b' })]).bosses).toBe(2);
  });
```

В `tests/hud/achievements.test.ts`: `toHaveLength(12)` → `toHaveLength(13)` (число строк: заголовок + 12), `1/11` → `1/12` (в двух тестах, en и ru), `expect(order).toHaveLength(11)` → `toHaveLength(12)`, а `expect(lines.at(-1)).toContain('🔒 Jack of All Trades')` → `toContain('🔒 Boss Slayer')`.

В `tests/engine/achievements.test.ts`: «lists the 11 achievements» → 12 (название и `toHaveLength(11)` → `12`), «nothing earned» `toHaveLength(11)` → `12`.

В `tests/server/tools.test.ts` в тесте `get_achievements ...`: `0/11` → `0/12`, `total: 11` → `total: 12`, `1/11` → `1/12`, `data.items toHaveLength(11)` → `12`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/game/achievements.test.ts tests/hud/achievements.test.ts tests/engine/achievements.test.ts tests/server/tools.test.ts -t "chievement"`
Expected: FAIL (в каталоге 11 достижений, нет `bosses` в счётчиках).

- [ ] **Step 3: Write minimal implementation**

3a. В `src/game/achievements.ts`: в `Counters` добавить `/** Defeated bosses (the `boss_defeated` events). */ bosses: number;`; в `counters()` начальный объект `{ ..., epic: 0, bosses: 0 }` и ветка `else if (event.type === 'boss_defeated') result.bosses++;` (рядом с `level_up`); в `ACHIEVEMENTS` последним добавить `{ id: 'boss-slayer', goal: 1, value: (c) => c.bosses },`.

3b. В `src/i18n/en.ts` после `achievement.jack-of-all-trades.desc` добавить:

```ts
  'achievement.boss-slayer.name': 'Boss Slayer',
  'achievement.boss-slayer.desc': 'Defeat your first boss.',
```

В `src/i18n/ru.ts`:

```ts
  'achievement.boss-slayer.name': 'Убийца боссов',
  'achievement.boss-slayer.desc': 'Победить первого босса.',
```

3c. В спецификации достижений (§2) в таблицу добавить строку `| `boss-slayer` | Boss Slayer / Убийца боссов | число событий `boss_defeated` | 1 |` и заменить «Каталог (11)» на «Каталог (12)» и «все 11 достижений» на «все 12 достижений».

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/game/achievements.test.ts tests/hud/achievements.test.ts tests/engine/achievements.test.ts tests/i18n tests/server`
Expected: PASS (число инструментов здесь ещё не менялось). Затем `npx tsc --noEmit` и `npx biome check --write .`.

- [ ] **Step 5: Commit**

```bash
git add src/game/achievements.ts src/i18n tests docs/superpowers/specs
git commit -m "feat(bosses): the Boss Slayer achievement

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Цикл и `Engine.bosses`

**Files:**
- Modify: `src/engine/cycle.ts` (перед достижениями)
- Modify: `src/engine/index.ts` (метод `bosses`)
- Test: `tests/engine/bosses.test.ts`

**Interfaces:**
- Consumes: `bossEvents`, `evaluateBosses`, `BossesView` (задача 1); `readEvents`, `Engine.view`, `Engine.storeOf`.
- Produces: события `boss_spawned`/`boss_defeated` в журнале; `Engine.bosses(request?: ProjectRequest): Promise<BossesView>`.

- [ ] **Step 1: Write the failing test**

Создать `tests/engine/bosses.test.ts`:

```ts
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { bossesText } from '../../src/hud/bosses.js';
import { readEvents } from '../../src/storage/journal.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

/** The shop has one unused file; five more reach the threshold of the Graveyard (6). */
async function graveyardShop(extra = 5) {
  const root = await copyFixture('projects/nextjs-shop');
  const dead: string[] = [path.join(root, 'components', 'ProductBadge.tsx')];
  for (let i = 1; i <= extra; i++) {
    const file = path.join(root, 'components', `Dead${i}.tsx`);
    await writeFile(file, `export const Dead${i} = () => null;\n`);
    dead.push(file);
  }
  const home = await makeTempDir();
  return { root, dead, engine: new Engine({ home, cwd: root, now: () => new Date() }) };
}

const bossTypes = async (engine: Engine, project: Parameters<Engine['storeOf']>[0]): Promise<string[]> => {
  const { events } = await readEvents(engine.storeOf(project).file('events'));
  return events
    .filter((event) => event.type === 'boss_spawned' || event.type === 'boss_defeated')
    .map((event) => `${event.type}:${String(event.data.id)}`);
};

describe('bosses in the cycle', () => {
  it('a project without a cluster of problems has no boss', async () => {
    const root = await copyFixture('projects/nextjs-shop');
    const engine = new Engine({ home: await makeTempDir(), cwd: root, now: () => new Date() });
    const view = await engine.view({});
    expect(await bossTypes(engine, view.project)).toEqual([]);
    expect(await engine.bosses({})).toMatchObject({ active: [], defeated: [] });
  });

  it('a cluster starts a fight once, and later cycles add nothing', async () => {
    const { engine } = await graveyardShop();
    const first = await engine.view({});
    expect(await bossTypes(engine, first.project)).toEqual(['boss_spawned:graveyard']);
    const board = await engine.bosses({});
    expect(board.active).toHaveLength(1);
    expect(board.active[0]).toMatchObject({ id: 'graveyard', hp: 6, max: 6 });
    expect(bossesText(board)).toContain('Graveyard · 6/6 HP (100%)');

    await engine.refresh({}, true);
    await engine.verify({});
    expect(await bossTypes(engine, first.project)).toEqual(['boss_spawned:graveyard']);
  });

  it('fixing the findings wins the fight and opens Boss Slayer; a new cluster starts a new fight', async () => {
    const { root, dead, engine } = await graveyardShop();
    const first = await engine.view({});
    for (const file of dead) await rm(file);
    const view = await engine.refresh({}, true);
    const types = view.events.map((event) => event.type);
    expect(types).toContain('boss_defeated');
    expect(view.events.filter((event) => event.type === 'achievement_unlocked').map((event) => event.data.id)).toContain(
      'boss-slayer',
    );
    expect(await bossTypes(engine, first.project)).toEqual(['boss_spawned:graveyard', 'boss_defeated:graveyard']);
    const board = await engine.bosses({});
    expect(board.active).toEqual([]);
    expect(board.defeated.map((boss) => boss.id)).toEqual(['graveyard']);

    for (let i = 1; i <= 6; i++) await writeFile(path.join(root, 'components', `Back${i}.tsx`), `export const B${i} = () => null;\n`);
    await engine.refresh({}, true);
    expect(await bossTypes(engine, first.project)).toEqual([
      'boss_spawned:graveyard',
      'boss_defeated:graveyard',
      'boss_spawned:graveyard',
    ]);
    const achievements = await engine.achievements({});
    expect(achievements.items.find((item) => item.id === 'boss-slayer')?.value).toBe(1);
  });
});
```

(Если на этапе RED окажется, что неиспользуемые файлы фикстуры находятся иначе — например, `Dead*.tsx` не считаются неиспользуемыми, — подобрать содержимое файлов так, чтобы сканер дал ≥ 6 находок `generic/unused-file`, и записать `Ruling:` в журнал.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/bosses.test.ts`
Expected: FAIL (`engine.bosses is not a function`; в журнале нет событий боссов).

- [ ] **Step 3: Write minimal implementation**

3a. В `src/engine/cycle.ts` добавить импорт `import { bossEvents } from '../game/bosses.js';` и непосредственно перед строкой с `newlyUnlocked(...)` (то есть до достижений, чтобы победа попала в их подсчёт этого же цикла) вставить:

```ts
    // Bosses: fights that start or end with the findings of this very analysis.
    events.push(...bossEvents(snapshot.findings, [...loaded.events, ...events], at));
```

3b. В `src/engine/index.ts` добавить импорт `import { type BossesView, evaluateBosses } from '../game/bosses.js';` и метод рядом с `achievements`:

```ts
  /**
   * The bosses: the fights that are on (HP, related quests) and the victories. It looks at the project first, so the
   * fights of the latest analysis are already in the journal.
   */
  async bosses(request: ProjectRequest = {}): Promise<BossesView> {
    const view = await this.view(request);
    const { events } = await readEvents(this.storeOf(view.project).file('events'));
    const board = evaluateBosses(view.snapshot?.findings ?? [], events, view.state.quests);
    return { project: view.project, lang: view.lang, ...board };
  }
```

- [ ] **Step 4: Run tests to verify they pass, then the whole suite**

Run: `npx vitest run tests/engine/bosses.test.ts` → PASS.
Run: `npm test` (вывод в файл рабочей папки, посмотреть хвост). Если упали чужие тесты (счёт событий в журнале, строки уведомлений), починить по смыслу и записать `Ruling:` в журнал. Затем `npx tsc --noEmit` и `npx biome check --write .`.

- [ ] **Step 5: Commit**

```bash
git add src/engine tests
git commit -m "feat(bosses): the cycle starts and ends the fights; Engine.bosses

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: MCP-инструмент `get_project_bosses`, документация, полная проверка

**Files:**
- Modify: `src/tools/register.ts` (инструмент после `get_achievements`; импорты)
- Modify: `tests/server/server.test.ts`, `tests/server/tools.test.ts` (число и имена инструментов; новый тест)
- Modify: `ПЛАН.md` (строка статуса)

**Interfaces:**
- Consumes: `Engine.bosses` (задача 4); `bossesText`, `bossName`, `bossDescription`, `bossPercent` (задача 2); `PROJECT_PATH`, `READ_ONLY`, `fail`.
- Produces: инструмент `get_project_bosses` (`project_path?`); `structuredContent`: `{ project, active: [{ id, name, description, hp, max, percent, quests, spawnedAt }], defeated: [{ id, name, defeatedAt }] }`.

- [ ] **Step 1: Write the failing test**

В `tests/server/tools.test.ts` добавить в импорты `import { writeFile } from 'node:fs/promises';` (объединить с существующим импортом `readdir, rm`) и тест в `describe('tools', ...)`:

```ts
  it('get_project_bosses shows a boss that a cluster of problems made, and says so when there is none', async () => {
    const quiet = await connect();
    const none = await quiet.call('get_project_bosses');
    expect(none.isError).toBeFalsy();
    expect(text(none)).toContain('No bosses');
    expect(none.structuredContent).toMatchObject({ active: [], defeated: [] });

    const { call, project } = await connect();
    for (let i = 1; i <= 5; i++) {
      await writeFile(path.join(project, 'components', `Dead${i}.tsx`), `export const Dead${i} = () => null;\n`);
    }
    const result = await call('get_project_bosses');
    expect(text(result)).toContain('BOSSES');
    expect(text(result)).toContain('⚔️ Graveyard · 6/6 HP (100%)');
    expect(result.structuredContent).toMatchObject({
      active: [{ id: 'graveyard', name: 'Graveyard', hp: 6, max: 6, percent: 100 }],
      defeated: [],
    });
  });
```

В тесте со списком инструментов `tests/server/tools.test.ts`: `toHaveLength(12)` → `toHaveLength(13)` и в `arrayContaining([...])` добавить `'get_project_bosses'`. В `tests/server/server.test.ts`: в отсортированный список добавить `'get_project_bosses',` (между `'get_player_level'` и `'get_project_history'`) и дописать в название теста `, get_achievements and get_project_bosses` (если название уже перечисляет инструменты — добавить `get_project_bosses`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/server`
Expected: FAIL (нет инструмента `get_project_bosses`; обновлённые списки не совпадают).

- [ ] **Step 3: Write minimal implementation**

В `src/tools/register.ts` добавить импорт `import { bossDescription, bossesText, bossName, bossPercent } from '../hud/bosses.js';` и после регистрации `get_achievements`:

```ts
  server.registerTool(
    'get_project_bosses',
    {
      title: 'Get project bosses',
      description:
        'Show the bosses of a project: big clusters of related problems (for example many modules without tests). Each active boss has HP (how many of its problems are left), its biggest HP and the number of open quests that fight it; defeated bosses are listed with the date. Bosses give no XP. Read-only.',
      inputSchema: { project_path: PROJECT_PATH },
      annotations: READ_ONLY,
    },
    async ({ project_path }) => {
      try {
        const view = await engine.bosses({ projectPath: project_path });
        return {
          content: [{ type: 'text', text: bossesText(view) }],
          structuredContent: {
            project: { ...view.project },
            active: view.active.map((boss) => ({
              id: boss.id,
              name: bossName(boss.id, view.lang),
              description: bossDescription(boss.id, view.lang) ?? '',
              hp: boss.hp,
              max: boss.max,
              percent: bossPercent(boss.hp, boss.max),
              quests: boss.quests,
              spawnedAt: boss.spawnedAt,
            })),
            defeated: view.defeated.map((boss) => ({
              id: boss.id,
              name: bossName(boss.id, view.lang),
              defeatedAt: boss.defeatedAt,
            })),
          },
        };
      } catch (error) {
        return await fail(error);
      }
    },
  );
```

В `ПЛАН.md` в строку статуса после фразы про классы добавить: «Фаза 2, часть 4 готова: боссы (7 тем, HP, события появления и победы, достижение «Убийца боссов», `get_project_bosses`; спецификация `docs/superpowers/specs/2026-10-02-codequest-bosses-design.md`). Фаза 2 закончена.»

- [ ] **Step 4: Run tests to verify they pass, then the whole check**

Run: `npx vitest run tests/server` → PASS.
Run: `npm run check` (3–5 минут; вывод в файл, посмотреть хвост). Expected: typecheck, lint и все тесты зелёные.
Run: `npm run build` — пересобрать `dist`.

- [ ] **Step 5: Commit**

```bash
git add src/tools/register.ts tests/server ПЛАН.md
git commit -m "feat(bosses): get_project_bosses MCP tool

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

После коммита сообщить пользователю: что сделано, реальное число тестов, что не проверено вживую (вызов из настоящей сессии Claude, вид уведомлений), что для обновления нужно закрыть доску (Q) и перезапустить MCP-сервер, и что у его проекта боссы появятся при первом полном цикле (V или R) — по реальным находкам (в его проекте их 144).
