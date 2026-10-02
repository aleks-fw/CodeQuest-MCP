# CodeQuest: история проекта — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MCP-инструмент `get_project_history`: вехи проекта по дням с итогом дня, из журнала событий, на языке из настроек.

**Architecture:** Чистая функция `buildHistory` (события → дни) в `src/game/`, вывод текста в `src/hud/history.ts` на готовых `notificationLine`/`titleOf`/`t`, чтение журнала в `Engine.history`, тонкая обёртка-инструмент в `src/tools/register.ts`. Нового хранилища нет: всё считается из `events.jsonl`.

**Tech Stack:** TypeScript (strict), Vitest, Biome, `@modelcontextprotocol/sdk`, zod.

**Spec:** `docs/superpowers/specs/2026-10-02-codequest-history-design.md`

## Global Constraints

- Только вехи из спецификации §2: `quest_completed`, `xp` с полем `topUp`, `level_up`, `finding_returned`, `settings_changed`. Остальные типы событий и обычные `xp` в историю не попадают.
- `days`: по умолчанию 14, от 1 до 365, значение вне границ приводится к границе, а не отвергается.
- День считается по местному времени процесса, время события — `ЧЧ:ММ` местное; дни и события внутри дня — от новых к старым.
- Никакого нового хранилища и никакой записи в журнал: инструмент только читает (`readOnlyHint`).
- Тексты на ru и en через каталоги `src/i18n/en.ts` и `ru.ts`; у каждого ключа одинаковые плейсхолдеры в обоих языках (проверяет `tests/i18n/i18n.test.ts`).
- Файлы с автором коммитов `aleks-fw`, в конце сообщения коммита строка `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Push не делать.
- Правки через Edit/Write, не через heredoc с `\n` (в Bash-heredoc обратные слэши портятся). Полный `npm run check` занимает 3–5 минут.

## Review Focus

Что спецификация подразумевает, но явно не говорит; каждая строка закреплена тестом в указанной задаче.

1. Событие с битой датой в `at` (`"garbage"`): пропускается, история не падает. Задача 1.
2. Событие с неверным типом данных (`xp: "lots"`): считается как 0 XP, квест при этом посчитан. Задача 1.
3. `days` равно `NaN`, `0`, `-5`, `2.9`, `1000`: приводится к 14 / 1 / 1 / 2 / 365. Задача 1 и задача 4 (через MCP).
4. Событие в 23:59 и в 00:00 попадает в правильный день. Задача 1.
5. День, в котором была только смена настроек: показывается, заголовок без нулевых частей (`2026-10-01`, без «+0 XP» и «0 квестов»). Задачи 1 и 2.

---

### Task 1: Ядро — `buildHistory`

**Files:**
- Create: `src/game/history.ts`
- Test: `tests/game/history.test.ts`

**Interfaces:**
- Consumes: `GameEvent`, `ProjectRef` из `src/types.ts`; `Lang` из `src/i18n/index.ts`.
- Produces (их используют задачи 2–4):
  - `DEFAULT_DAYS = 14`, `MAX_DAYS = 365`
  - `clampDays(days: number | undefined): number`
  - `isMilestone(event: GameEvent): boolean`
  - `interface HistoryEntry { event: GameEvent; time: string }`
  - `interface HistoryDay { date: string; xp: number; quests: number; levelFrom?: number; levelTo?: number; entries: HistoryEntry[] }`
  - `interface HistoryView { project: ProjectRef; lang: Lang; period: number; days: HistoryDay[] }`
  - `buildHistory(events: readonly GameEvent[], options: { days?: number; now: Date }): HistoryDay[]`

- [ ] **Step 1: Write the failing test**

Создать `tests/game/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildHistory, clampDays, isMilestone } from '../../src/game/history.js';
import type { EventType, GameEvent } from '../../src/types.js';

let seq = 0;
// Local times, so the tests do not depend on the time zone of the machine.
const local = (day: number, hour: number, minute = 0): string => new Date(2026, 9, day, hour, minute).toISOString();
const event = (type: EventType, at: string, data: Record<string, unknown> = {}): GameEvent => ({
  seq: ++seq,
  at,
  type,
  data,
});
const NOW = new Date(2026, 9, 2, 12, 0);

describe('buildHistory', () => {
  it('groups milestones by day, newest first, with the totals of the day', () => {
    const events = [
      event('quest_completed', local(1, 10, 0), { id: 'a', xp: 80 }),
      event('level_up', local(2, 9, 40), { from: 2, to: 3 }),
      event('quest_completed', local(2, 11, 21), { id: 'b', xp: 76 }),
      event('xp', local(2, 11, 23), { amount: 95, quest: 'c', topUp: 'c' }),
    ];
    const days = buildHistory(events, { now: NOW });
    expect(days.map((day) => day.date)).toEqual(['2026-10-02', '2026-10-01']);
    expect(days[0]).toMatchObject({ xp: 171, quests: 1, levelFrom: 2, levelTo: 3 });
    expect(days[0]?.entries.map((entry) => entry.event.type)).toEqual(['xp', 'quest_completed', 'level_up']);
    expect(days[0]?.entries.map((entry) => entry.time)).toEqual(['11:23', '11:21', '09:40']);
    expect(days[1]).toMatchObject({ xp: 80, quests: 1 });
    expect(days[1]?.levelFrom).toBeUndefined();
  });

  it('shows only milestones: no analyses, openings, failed checks or plain xp (it is already in the completion)', () => {
    const at = local(2, 10);
    const events = [
      event('analysis', at),
      event('quest_opened', at, { id: 'a' }),
      event('quest_accepted', at, { id: 'a' }),
      event('quest_released', at, { id: 'a' }),
      event('quest_obsolete', at, { id: 'a' }),
      event('epic_progress', at, { id: 'a' }),
      event('verification_failed', at, { id: 'a' }),
      event('xp', at, { amount: 80, quest: 'a' }),
    ];
    expect(buildHistory(events, { now: NOW })).toEqual([]);
    expect(isMilestone(event('xp', at, { amount: 20, topUp: 'a' }))).toBe(true);
    expect(isMilestone(event('xp', at, { amount: 20 }))).toBe(false);
  });

  it('the window is `days` calendar days ending today', () => {
    const events = [
      event('level_up', local(2, 9), { from: 1, to: 2 }),
      event('level_up', local(1, 9), { from: 1, to: 2 }),
      event('level_up', new Date(2026, 8, 30, 9).toISOString(), { from: 1, to: 2 }),
    ];
    expect(buildHistory(events, { days: 1, now: NOW }).map((day) => day.date)).toEqual(['2026-10-02']);
    expect(buildHistory(events, { days: 2, now: NOW }).map((day) => day.date)).toEqual(['2026-10-02', '2026-10-01']);
    expect(buildHistory(events, { days: 3, now: NOW })).toHaveLength(3);
  });

  it('a minute before midnight and midnight itself fall on different days', () => {
    const events = [
      event('level_up', local(1, 23, 59), { from: 1, to: 2 }),
      event('level_up', local(2, 0, 0), { from: 2, to: 3 }),
    ];
    const days = buildHistory(events, { now: NOW });
    expect(days.map((day) => [day.date, day.levelFrom])).toEqual([
      ['2026-10-02', 2],
      ['2026-10-01', 1],
    ]);
  });

  it('skips an event with a broken date and counts wrong-typed numbers as 0', () => {
    const events = [
      event('quest_completed', 'garbage', { xp: 50 }),
      event('quest_completed', local(2, 10), { xp: 'lots' }),
      event('level_up', local(2, 11), { from: 'a', to: null }),
    ];
    const days = buildHistory(events, { now: NOW });
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ xp: 0, quests: 1 });
    expect(days[0]?.entries).toHaveLength(2);
  });

  it('a day with only a settings change is shown, with nothing to total', () => {
    const days = buildHistory([event('settings_changed', local(1, 8), { allowCommands: true })], { now: NOW });
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ date: '2026-10-01', xp: 0, quests: 0 });
    expect(days[0]?.levelFrom).toBeUndefined();
  });

  it('does not depend on the order of the input', () => {
    const events = [
      event('quest_completed', local(2, 10, 0), { xp: 10 }),
      event('quest_completed', local(2, 11, 0), { xp: 20 }),
    ];
    const reversed = [...events].reverse();
    expect(buildHistory(reversed, { now: NOW })).toEqual(buildHistory(events, { now: NOW }));
    expect(buildHistory(events, { now: NOW })[0]?.entries.map((entry) => entry.time)).toEqual(['11:00', '10:00']);
  });
});

describe('clampDays', () => {
  it('defaults to 14 and keeps the value inside 1–365', () => {
    expect(clampDays(undefined)).toBe(14);
    expect(clampDays(Number.NaN)).toBe(14);
    expect(clampDays(0)).toBe(1);
    expect(clampDays(-5)).toBe(1);
    expect(clampDays(2.9)).toBe(2);
    expect(clampDays(1000)).toBe(365);
    expect(clampDays(30)).toBe(30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/history.test.ts`
Expected: FAIL, не найден модуль `../../src/game/history.js`.

- [ ] **Step 3: Write minimal implementation**

Создать `src/game/history.ts`:

```ts
import type { Lang } from '../i18n/index.js';
import type { GameEvent, ProjectRef } from '../types.js';

export const DEFAULT_DAYS = 14;
export const MAX_DAYS = 365;

export interface HistoryEntry {
  event: GameEvent;
  /** Local time of the event, `HH:MM`. */
  time: string;
}

export interface HistoryDay {
  /** Local date, `YYYY-MM-DD`. */
  date: string;
  xp: number;
  quests: number;
  levelFrom?: number;
  levelTo?: number;
  /** Newest first. */
  entries: HistoryEntry[];
}

/** What `Engine.history` returns and the texts are drawn from. */
export interface HistoryView {
  project: ProjectRef;
  lang: Lang;
  /** The number of days asked for, after clamping. */
  period: number;
  days: HistoryDay[];
}

/** The number of days to look back: 14 by default, and always inside 1–365. */
export function clampDays(days: number | undefined): number {
  if (days === undefined || !Number.isFinite(days)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(1, Math.trunc(days)));
}

const two = (value: number): string => String(value).padStart(2, '0');
const dateKey = (date: Date): string => `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
const timeKey = (date: Date): string => `${two(date.getHours())}:${two(date.getMinutes())}`;
const amount = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/**
 * The events the history tells about (spec §2). A plain `xp` event is not one: its amount is already in the
 * `quest_completed` of the same quest; only a top-up is a separate payment.
 */
export function isMilestone(event: GameEvent): boolean {
  switch (event.type) {
    case 'quest_completed':
    case 'level_up':
    case 'finding_returned':
    case 'settings_changed':
      return true;
    case 'xp':
      return typeof event.data.topUp === 'string';
    default:
      return false;
  }
}

/** Milestones of the last `days` calendar days (local time), by day, newest first, with the totals of each day. */
export function buildHistory(events: readonly GameEvent[], options: { days?: number; now: Date }): HistoryDay[] {
  const { now } = options;
  const first = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (clampDays(options.days) - 1)));
  const byDate = new Map<string, HistoryDay>();
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (!isMilestone(event)) continue;
    const when = new Date(event.at);
    if (Number.isNaN(when.getTime())) continue;
    const date = dateKey(when);
    if (date < first) continue;
    let day = byDate.get(date);
    if (day === undefined) {
      day = { date, xp: 0, quests: 0, entries: [] };
      byDate.set(date, day);
    }
    if (event.type === 'quest_completed') {
      day.xp += amount(event.data.xp);
      day.quests++;
    } else if (event.type === 'xp') {
      day.xp += amount(event.data.amount);
    } else if (event.type === 'level_up') {
      day.levelFrom ??= amount(event.data.from);
      day.levelTo = amount(event.data.to);
    }
    day.entries.unshift({ event, time: timeKey(when) });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/game/history.test.ts`
Expected: PASS, 8 tests. Затем `npx tsc --noEmit` и `npx biome check --write .` без ошибок.

- [ ] **Step 5: Commit**

```bash
git add src/game/history.ts tests/game/history.test.ts
git commit -m "feat(history): milestones of the journal grouped by day

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Тексты — каталоги и `historyText`

**Files:**
- Create: `src/hud/history.ts`
- Modify: `src/i18n/en.ts`, `src/i18n/ru.ts` (добавить ключи `history.*` перед `...questsEn` / `...questsRu`, рядом с блоком `error.*`)
- Modify: `docs/superpowers/specs/2026-10-02-codequest-history-design.md` (§5, см. шаг 5)
- Test: `tests/hud/history.test.ts`

**Interfaces:**
- Consumes: `buildHistory`, `HistoryDay`, `HistoryView` (задача 1); `notificationLine`, `titleOf` из `src/hud/notifications.ts`; `t`, `tn`, `Lang` из `src/i18n/index.ts`.
- Produces: `historyLine(event: GameEvent, lang: Lang): string`, `dayHeader(day: HistoryDay, lang: Lang): string`, `historyText(view: HistoryView): string`.

- [ ] **Step 1: Write the failing test**

Создать `tests/hud/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildHistory, type HistoryView } from '../../src/game/history.js';
import { dayHeader, historyLine, historyText } from '../../src/hud/history.js';
import type { Lang } from '../../src/i18n/index.js';
import type { EventType, GameEvent } from '../../src/types.js';

let seq = 0;
const local = (day: number, hour: number, minute = 0): string => new Date(2026, 9, day, hour, minute).toISOString();
const event = (type: EventType, at: string, data: Record<string, unknown> = {}): GameEvent => ({
  seq: ++seq,
  at,
  type,
  data,
});
const NOW = new Date(2026, 9, 2, 12, 0);

const EVENTS = [
  event('level_up', local(2, 9, 40), { from: 2, to: 3 }),
  event('quest_completed', local(2, 11, 21), { id: 'b', title: 'Remove Hardcoded Secret', xp: 76 }),
  event('xp', local(2, 11, 23), { amount: 95, quest: 'b', topUp: 'b', title: 'Remove Hardcoded Secret' }),
];

const view = (lang: Lang, events: GameEvent[] = EVENTS, period = 14): HistoryView => ({
  project: { id: 'x', name: 'shop', root: '/shop' },
  lang,
  period,
  days: buildHistory(events, { now: NOW, days: period }),
});

describe('historyText', () => {
  it('shows days with their totals and the milestones, newest first, in English', () => {
    const lines = historyText(view('en')).split('\n');
    expect(lines[0]).toBe('HISTORY · shop · last 14 days');
    expect(lines[1]).toBe('2026-10-02 · +171 XP · 1 quest · LVL 2 → 3');
    expect(lines[2]).toContain('  11:23 + 95 XP · Remove Hardcoded Secret: confirmed');
    expect(lines[3]).toBe('  11:21 ✓ Remove Hardcoded Secret · +76 XP');
    expect(lines[4]).toContain('  09:40 ');
    expect(lines[4]).toContain('LEVEL UP 2 → 3');
  });

  it('speaks Russian when the language is Russian', () => {
    const lines = historyText(view('ru')).split('\n');
    expect(lines[0]).toBe('ИСТОРИЯ · shop · за 14 дн.');
    expect(lines[1]).toBe('2026-10-02 · +171 XP · 1 квест · УР. 2 → 3');
    expect(lines[2]).toContain('подтверждено');
  });

  it('says so when there is nothing to tell', () => {
    expect(historyText(view('en', []))).toBe('HISTORY · shop · last 14 days\nNo milestones for this period.');
    expect(historyText(view('ru', [])).split('\n')[1]).toBe('За этот период вех нет.');
  });

  it('a quest from an old event without a template shows the stored title', () => {
    const old = [event('quest_completed', local(2, 10), { id: 'o', title: 'Old Quest', xp: 10 })];
    expect(historyText(view('ru', old))).toContain('✓ Old Quest · +10 XP');
  });
});

describe('dayHeader', () => {
  it('leaves out the parts that are zero', () => {
    const only = buildHistory([event('settings_changed', local(1, 8), { allowCommands: true })], { now: NOW });
    expect(dayHeader(only[0]!, 'en')).toBe('2026-10-01');
    const plural = buildHistory(
      [
        event('quest_completed', local(2, 8), { xp: 10 }),
        event('quest_completed', local(2, 9), { xp: 20 }),
        event('quest_completed', local(2, 10), { xp: 30 }),
      ],
      { now: NOW },
    );
    expect(dayHeader(plural[0]!, 'en')).toBe('2026-10-02 · +60 XP · 3 quests');
    expect(dayHeader(plural[0]!, 'ru')).toBe('2026-10-02 · +60 XP · 3 квеста');
  });
});

describe('historyLine', () => {
  it('words a settings change and a returned problem', () => {
    const on = event('settings_changed', local(1, 8), { allowCommands: true, commandTimeoutSec: 900 });
    expect(historyLine(on, 'en')).toBe('⚙ Project commands allowed (timeout 900s)');
    expect(historyLine(on, 'ru')).toBe('⚙ Команды проекта разрешены (таймаут 900 с)');
    const off = event('settings_changed', local(1, 9), { allowCommands: false });
    expect(historyLine(off, 'en')).toBe('⚙ Project commands not allowed');
    const back = event('finding_returned', local(1, 10), { rule: 'js/eval', file: 'calc.ts' });
    expect(historyLine(back, 'en')).toContain('js/eval');
    expect(historyLine(back, 'en')).toContain('calc.ts');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hud/history.test.ts`
Expected: FAIL, не найден модуль `../../src/hud/history.js`.

- [ ] **Step 3: Write minimal implementation**

3a. В `src/i18n/en.ts` добавить после строки `'error.needsValue': ...`:

```ts
  'history.title': 'HISTORY · {project} · {period}',
  'history.period.one': 'last {n} day',
  'history.period.few': 'last {n} days',
  'history.period.many': 'last {n} days',
  'history.empty': 'No milestones for this period.',
  'history.quests.one': '{n} quest',
  'history.quests.few': '{n} quests',
  'history.quests.many': '{n} quests',
  'history.level': 'LVL {from} → {to}',
  'history.completed': '✓ {title} · +{xp} XP',
  'history.commandsOn': '⚙ Project commands allowed (timeout {sec}s)',
  'history.commandsOff': '⚙ Project commands not allowed',
```

В `src/i18n/ru.ts` после `'error.needsValue': ...`:

```ts
  'history.title': 'ИСТОРИЯ · {project} · {period}',
  'history.period.one': 'за {n} дн.',
  'history.period.few': 'за {n} дн.',
  'history.period.many': 'за {n} дн.',
  'history.empty': 'За этот период вех нет.',
  'history.quests.one': '{n} квест',
  'history.quests.few': '{n} квеста',
  'history.quests.many': '{n} квестов',
  'history.level': 'УР. {from} → {to}',
  'history.completed': '✓ {title} · +{xp} XP',
  'history.commandsOn': '⚙ Команды проекта разрешены (таймаут {sec} с)',
  'history.commandsOff': '⚙ Команды проекта не разрешены',
```

3b. Создать `src/hud/history.ts`:

```ts
import type { HistoryDay, HistoryView } from '../game/history.js';
import { type Lang, t, tn } from '../i18n/index.js';
import type { GameEvent } from '../types.js';
import { notificationLine, titleOf } from './notifications.js';

const num = (value: unknown): number => (typeof value === 'number' ? value : 0);

/** One milestone as a line of text; level-ups, top-ups and returned problems reuse the wording of the notifications. */
export function historyLine(event: GameEvent, lang: Lang): string {
  const { data } = event;
  if (event.type === 'quest_completed') {
    return t(lang, 'history.completed', { title: titleOf(data, lang), xp: num(data.xp) });
  }
  if (event.type === 'settings_changed') {
    return data.allowCommands === true
      ? t(lang, 'history.commandsOn', { sec: num(data.commandTimeoutSec) })
      : t(lang, 'history.commandsOff');
  }
  return notificationLine(event, lang) ?? '';
}

/** `2026-10-02 · +171 XP · 2 quests · LVL 2 → 3`; a part that is zero is left out. */
export function dayHeader(day: HistoryDay, lang: Lang): string {
  const parts = [day.date];
  if (day.xp > 0) parts.push(`+${day.xp} XP`);
  if (day.quests > 0) parts.push(tn(lang, 'history.quests', day.quests));
  if (day.levelFrom !== undefined && day.levelTo !== undefined) {
    parts.push(t(lang, 'history.level', { from: day.levelFrom, to: day.levelTo }));
  }
  return parts.join(' · ');
}

export function historyText(view: HistoryView): string {
  const { lang } = view;
  const head = t(lang, 'history.title', {
    project: view.project.name,
    period: tn(lang, 'history.period', view.period),
  });
  if (view.days.length === 0) return `${head}\n${t(lang, 'history.empty')}`;
  const lines = [head];
  for (const day of view.days) {
    lines.push(dayHeader(day, lang));
    for (const entry of day.entries) lines.push(`  ${entry.time} ${historyLine(entry.event, lang)}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hud/history.test.ts tests/i18n`
Expected: PASS (в том числе общий тест каталогов: одинаковые ключи и плейсхолдеры в ru и en). Затем `npx tsc --noEmit` и `npx biome check --write .`. Если Biome ругается на `!` (non-null assertion) в тесте, заменить `only[0]!` на `only[0] as HistoryDay` с импортом типа.

- [ ] **Step 5: Align the spec with the wording and commit**

В `docs/superpowers/specs/2026-10-02-codequest-history-design.md` в §5 заменить пример вывода и последнюю строку раздела на фактические:

```
ИСТОРИЯ · <проект> · за 14 дн.
2026-10-02 · +171 XP · 1 квест · УР. 2 → 3
  11:23 + 95 XP · Remove Hardcoded Secret: подтверждено зелёным прогоном команд проекта
  11:21 ✓ Remove Hardcoded Secret · +76 XP
  09:40 ⚔️ LEVEL UP 2 → 3 · <титул>
```

И строку про пустую историю: «За этот период вех нет.» Добавить в §3 фразу: «Части итога, равные нулю, в заголовке дня не показываются (день только со сменой настроек — одна дата).»

```bash
git add src/hud/history.ts src/i18n/en.ts src/i18n/ru.ts tests/hud/history.test.ts docs/superpowers/specs/2026-10-02-codequest-history-design.md
git commit -m "feat(history): texts of the history in ru and en

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `Engine.history`

**Files:**
- Modify: `src/engine/index.ts` (метод в классе `Engine`, рядом с `notifications`; импорты)
- Test: `tests/engine/history.test.ts`

**Interfaces:**
- Consumes: `buildHistory`, `clampDays`, `HistoryView` (задача 1); `readEvents` из `src/storage/journal.ts`; существующие `Engine.resolve`, `Engine.storeOf`, `Engine.language`, `this.env.now`.
- Produces: `Engine.history(request?: ProjectRequest, days?: number): Promise<HistoryView>`.

- [ ] **Step 1: Write the failing test**

Создать `tests/engine/history.test.ts`:

```ts
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { historyText } from '../../src/hud/history.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

async function shop() {
  const root = await copyFixture('projects/nextjs-shop');
  const home = await makeTempDir();
  return { root, engine: new Engine({ home, cwd: root, now: () => new Date() }) };
}

describe('Engine.history', () => {
  it('tells about the quest a real cycle completed', async () => {
    const { root, engine } = await shop();
    await engine.view({});
    expect((await engine.history({}, 7)).days).toEqual([]);
    await rm(path.join(root, 'components', 'ProductBadge.tsx'));
    await engine.poll();
    const view = await engine.history({}, 7);
    expect(view).toMatchObject({ period: 7, lang: 'en' });
    expect(view.days).toHaveLength(1);
    expect(view.days[0]).toMatchObject({ xp: 80, quests: 1 });
    expect(historyText(view)).toContain('Clean Inventory');
    await engine.setLanguage('ru');
    expect(historyText(await engine.history({}, 7))).toContain('ИСТОРИЯ');
  });

  it('a project that was never looked at has an empty history, and days are clamped', async () => {
    const { engine } = await shop();
    const view = await engine.history({}, 9999);
    expect(view.period).toBe(365);
    expect(view.days).toEqual([]);
    expect((await engine.history({}, 0)).period).toBe(1);
    expect((await engine.history({})).period).toBe(14);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/history.test.ts`
Expected: FAIL, `engine.history is not a function`.

- [ ] **Step 3: Write minimal implementation**

В `src/engine/index.ts` добавить импорты:

```ts
import { buildHistory, clampDays, type HistoryView } from '../game/history.js';
import { appendEvents, readEvents } from '../storage/journal.js';
```
(второй заменяет существующую строку `import { appendEvents } from '../storage/journal.js';`), и метод перед `notifications`:

```ts
  /**
   * The milestones of the last `days` days (14 by default, 1–365): read from the journal alone, without a cycle and
   * without the project lock (the journal is only appended to, a half-written last line is skipped). Never creates
   * anything: a project nobody looked at has an empty history.
   */
  async history(request: ProjectRequest = {}, days?: number): Promise<HistoryView> {
    const project = await this.resolve(request);
    const period = clampDays(days);
    const { events } = await readEvents(this.storeOf(project).file('events'));
    return {
      project,
      lang: await this.language(),
      period,
      days: buildHistory(events, { days: period, now: this.env.now() }),
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/history.test.ts`
Expected: PASS, 2 tests. Затем `npx tsc --noEmit` и `npx biome check --write .`.

- [ ] **Step 5: Commit**

```bash
git add src/engine/index.ts tests/engine/history.test.ts
git commit -m "feat(history): Engine.history reads the milestones of a project

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: MCP-инструмент `get_project_history`, документация, полная проверка

**Files:**
- Modify: `src/tools/register.ts` (новый инструмент после `get_project_stats`; импорты)
- Modify: `ПЛАН.md` (строка статуса и список инструментов в этапе 9 не трогать; добавить одну фразу в статус)
- Test: `tests/server/tools.test.ts` (новый тест в блоке `describe('tools', ...)`)

**Interfaces:**
- Consumes: `Engine.history` (задача 3); `historyText`, `historyLine` (задача 2); `PROJECT_PATH`, `READ_ONLY`, `fail` — уже есть в `register.ts`.
- Produces: MCP-инструмент `get_project_history` (`project_path?: string`, `days?: number`); `structuredContent`: `{ project, period, days: [{ date, xp, quests, levelFrom?, levelTo?, lines: string[] }] }`.

- [ ] **Step 1: Write the failing test**

В `tests/server/tools.test.ts` добавить внутрь `describe('tools', ...)` (рядом с тестом `get_quest_details`):

```ts
  it('get_project_history lists the milestones by day and clamps days', async () => {
    const { call, project } = await connect();
    await call('get_project_state');
    expect(text(await call('get_project_history'))).toContain('No milestones');

    await rm(path.join(project, 'components', 'ProductBadge.tsx'));
    await call('verify_quest_completion', { quest_id: 'Clean Inventory' });
    const result = await call('get_project_history', { days: 7 });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain('HISTORY');
    expect(text(result)).toContain('Clean Inventory · +80 XP');
    expect(result.structuredContent).toMatchObject({ period: 7, days: [{ xp: 80, quests: 1 }] });
    const lines = (result.structuredContent as { days: { lines: string[] }[] }).days[0]?.lines ?? [];
    expect(lines.some((line) => line.includes('Clean Inventory'))).toBe(true);

    const clamped = await call('get_project_history', { days: 0 });
    expect((clamped.structuredContent as { period: number }).period).toBe(1);
    const huge = await call('get_project_history', { days: 5000 });
    expect((huge.structuredContent as { period: number }).period).toBe(365);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/tools.test.ts -t "get_project_history"`
Expected: FAIL (инструмент не найден: `isError` или ошибка MCP «tool not found»).

- [ ] **Step 3: Write minimal implementation**

В `src/tools/register.ts` в импорт из `'../hud/present.js'` ничего не добавлять; добавить отдельный импорт:

```ts
import { historyLine, historyText } from '../hud/history.js';
```

и после регистрации `get_project_stats`:

```ts
  server.registerTool(
    'get_project_history',
    {
      title: 'Get project history',
      description:
        'Show the milestones of a project by day: completed quests with their XP, XP paid after a green run of the project commands, level-ups, problems that came back and changes of the project settings. Newest day first, each day with its totals. Default: the last 14 days; days can be 1–365. Read-only.',
      inputSchema: {
        project_path: PROJECT_PATH,
        days: z.number().optional().describe('How many days back to look: 1–365, default 14. Values outside are clamped.'),
      },
      annotations: READ_ONLY,
    },
    async ({ project_path, days }) => {
      try {
        const view = await engine.history({ projectPath: project_path }, days);
        return {
          content: [{ type: 'text', text: historyText(view) }],
          structuredContent: {
            project: { ...view.project },
            period: view.period,
            days: view.days.map((day) => ({
              date: day.date,
              xp: day.xp,
              quests: day.quests,
              ...(day.levelFrom === undefined ? {} : { levelFrom: day.levelFrom }),
              ...(day.levelTo === undefined ? {} : { levelTo: day.levelTo }),
              lines: day.entries.map((entry) => `${entry.time} ${historyLine(entry.event, view.lang)}`),
            })),
          },
        };
      } catch (error) {
        return await fail(error);
      }
    },
  );
```

В `ПЛАН.md` в строку «Статус:» после слов про этап 4 работ над языком добавить: «Фаза 2, часть 1 готова: история проекта (`get_project_history`, вехи по дням с итогом; спецификация `docs/superpowers/specs/2026-10-02-codequest-history-design.md`).»

- [ ] **Step 4: Run test to verify it passes, then the whole check**

Run: `npx vitest run tests/server/tools.test.ts` → PASS.
Run: `npm run check` (3–5 минут; запускать в фоне или с большим таймаутом). Expected: typecheck, lint и все тесты зелёные (число тестов больше 676 на 22–25 новых).
Run: `npm run build` — пересобрать `dist` (его запускает MCP).

- [ ] **Step 5: Commit**

```bash
git add src/tools/register.ts tests/server/tools.test.ts ПЛАН.md
git commit -m "feat(history): get_project_history MCP tool

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

После коммита сообщить пользователю: что сделано, реальное число тестов, что не проверено вживую (вызов из настоящей сессии Claude), и что для нового инструмента нужно перезапустить MCP-сервер (`dist` пересобран).
