# CodeQuest i18n, stage 1: mechanism and setting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One switchable language (`ru` / `en`) stored in `config.json`, changed by the MCP tool `set_language`, the CLI `codequest lang` and the key **L** on the board; the frames of every screen follow it.

**Architecture:** A small `src/i18n/` module (catalogs + `t` + `tn`), a `config.json` in the data folder, and an optional trailing `lang: Lang = 'en'` argument on every format function, so all existing callers and tests keep working. `Engine` reads the config on each request and puts `lang` on `ProjectView`; `present.ts`, the tools and the board pass it down. No global state.

**Tech Stack:** TypeScript strict, Vitest, Biome, zod, MCP SDK (already in the repo).

**Spec:** `docs/superpowers/specs/2026-09-30-i18n-design.md` (this plan is stage 1 of its three stages; quest texts = stage 2, check reasons and finding messages = stage 3, separate plans).

## Global Constraints

- English is the fallback: a missing `ru` key renders the English text; a missing key everywhere renders the key.
- `en` output stays byte-for-byte what it is now: every existing test must pass unchanged.
- Not translated: file names, commands, rule ids, MCP prompt bodies (they instruct the assistant and stay English), analyzer logs.
- Data folder file: `<CODEQUEST_HOME>/config.json` = `{ "schema": 1, "language": "ru" }`, atomic write; default `en`; a broken or unknown value falls back to `en`.
- All work and data on drive D; no new dependencies.
- Stage 1 leaves quest titles/descriptions, condition lines and check reasons in English (stages 2 and 3). Say so in the final report.
- Before starting: the interactive board work (commit pending in the working tree) must be committed first, so this plan starts from a clean tree.

## Review Focus

- `codequest lang xx` (unknown value) → error message, exit code 1, config unchanged.
- `config.json` broken (not JSON, or `language: 5`) → English, no crash; a later `lang ru` repairs it.
- Two processes (MCP server and the board) — the switch made in one shows in the other at its next request (config read per request, not cached).
- Russian plural forms: 1 задача, 2 задачи, 5 задач, 11 задач, 21 задача, 22 задачи.
- Russian text is wider: the board list and card never exceed the terminal width (existing width test, run with `ru`).
- Pressing **L** while a check is running is ignored like every other key (busy guard).

## File structure

- Create `src/i18n/index.ts` — `Lang`, `LANGS`, `isLang`, `LANGUAGE_NAMES`, `t`, `tn`, `pluralForm`.
- Create `src/i18n/en.ts`, `src/i18n/ru.ts` — catalogs `Record<string, string>`; each task appends its keys to both.
- Create `src/i18n/titles.ts` — the 50 level titles in both languages (`TITLES_EN`, `TITLES_RU`).
- Create `src/storage/config.ts` — `readLanguage`, `writeLanguage`.
- Modify `src/game/levels.ts`, `src/hud/{hud,notifications,quests,report,present,board-ui}.ts`, `src/cli/{board,run,index}.ts`, `src/engine/index.ts`, `src/tools/register.ts`.
- Tests: `tests/i18n/i18n.test.ts`, `tests/storage/config.test.ts`, extend `tests/hud/hud.test.ts`, `tests/hud/board-ui.test.ts`, `tests/cli/run.test.ts`, `tests/cli/board.test.ts`, `tests/server/tools.test.ts`.

---

### Task 1: i18n core and catalog completeness

**Files:**
- Create: `src/i18n/index.ts`, `src/i18n/en.ts`, `src/i18n/ru.ts`, `src/i18n/titles.ts`
- Modify: `src/game/levels.ts`
- Test: `tests/i18n/i18n.test.ts`

**Interfaces:**
- Produces:
  - `type Lang = 'en' | 'ru'`; `LANGS: readonly Lang[]`; `isLang(value: unknown): value is Lang`; `LANGUAGE_NAMES: Record<Lang, string>`
  - `t(lang: Lang, key: string, vars?: Record<string, string | number>): string`
  - `pluralForm(lang: Lang, n: number): 'one' | 'few' | 'many'`
  - `tn(lang: Lang, key: string, n: number, vars?: Record<string, string | number>): string` — looks up `${key}.${pluralForm}` and adds `{n}`.
  - `titleForLevel(level: number, lang?: Lang): string`, `hudTitle(level: number, lang?: Lang): string` (levels.ts, `lang` defaults to `'en'`); `TITLES` stays exported (= `TITLES_EN`).

- [ ] **Step 1: Write the failing test** `tests/i18n/i18n.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { hudTitle, TITLES, titleForLevel } from '../../src/game/levels.js';
import { CATALOGS, isLang, LANGS, pluralForm, t, tn } from '../../src/i18n/index.js';
import { TITLES_EN, TITLES_RU } from '../../src/i18n/titles.js';

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();

describe('catalogs', () => {
  it('every English key exists in every language with the same placeholders', () => {
    for (const lang of LANGS) {
      for (const [key, text] of Object.entries(CATALOGS.en)) {
        const other = CATALOGS[lang][key];
        expect(other, `${lang} is missing ${key}`).toBeDefined();
        expect(placeholders(other ?? ''), `${lang} placeholders of ${key}`).toEqual(placeholders(text));
      }
    }
  });

  it('no language has keys that English lacks', () => {
    for (const lang of LANGS) {
      for (const key of Object.keys(CATALOGS[lang])) expect(CATALOGS.en[key], `en is missing ${key}`).toBeDefined();
    }
  });

  it('there are 50 level titles in each language', () => {
    expect(TITLES_EN).toHaveLength(50);
    expect(TITLES_RU).toHaveLength(50);
    expect(TITLES).toBe(TITLES_EN);
  });
});

describe('t and tn', () => {
  it('fills placeholders, falls back to English and then to the key', () => {
    expect(t('en', 'lang.now', { name: 'English', code: 'en' })).toBe('Language: English (en)');
    expect(t('ru', 'lang.now', { name: 'Русский', code: 'ru' })).toBe('Язык: Русский (ru)');
    expect(t('ru', 'no.such.key')).toBe('no.such.key');
    expect(t('en', 'lang.now')).toBe('Language: {name} ({code})');
  });

  it('picks Russian plural forms', () => {
    const forms = [1, 2, 5, 11, 21, 22, 25, 100, 101, 112].map((n) => pluralForm('ru', n));
    expect(forms).toEqual(['one', 'few', 'many', 'many', 'one', 'few', 'many', 'many', 'one', 'many']);
    expect(pluralForm('en', 1)).toBe('one');
    expect(pluralForm('en', 2)).toBe('many');
  });

  it('counts with the right word', () => {
    expect(tn('ru', 'board.tasks', 1)).toBe('1 задача');
    expect(tn('ru', 'board.tasks', 3)).toBe('3 задачи');
    expect(tn('ru', 'board.tasks', 5)).toBe('5 задач');
    expect(tn('en', 'board.tasks', 1)).toBe('1 tasks');
  });

  it('isLang accepts only ru and en', () => {
    expect(isLang('ru')).toBe(true);
    expect(isLang('de')).toBe(false);
    expect(isLang(5)).toBe(false);
  });
});

describe('level titles', () => {
  it('follow the language and default to English', () => {
    expect(titleForLevel(1)).toBe('Newcomer');
    expect(titleForLevel(1, 'ru')).toBe('Новичок');
    expect(hudTitle(7, 'ru')).toBe('АНАЛИТИК');
    expect(hudTitle(7)).toBe('ANALYST');
    expect(titleForLevel(99, 'ru')).toBe('ЛЕГЕНДА');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/i18n/i18n.test.ts`
Expected: FAIL (module `src/i18n/index.js` not found).

- [ ] **Step 3: Implement**

`src/i18n/titles.ts`: move the array from `levels.ts` as `TITLES_EN` (same 50 strings, same order) and add:

```ts
export const TITLES_RU: readonly string[] = [
  'Новичок', 'Стажёр', 'Кодер', 'Разработчик', 'Практик', 'Инженер', 'Аналитик', 'Охотник за багами', 'Тестировщик',
  'Строитель', 'Исследователь', 'Чистильщик кода', 'Рефакторщик', 'Страж кода', 'Мастер систем', 'Архитектор',
  'Проектировщик', 'Убийца боссов', 'Эксперт', 'Мастер кода', 'Системный мыслитель', 'Главный архитектор',
  'Оптимизатор', 'Страж качества', 'Ветеран', 'Волшебник кода', 'Исследователь систем', 'Сетевой архитектор',
  'Убийца легаси', 'Старший архитектор', 'Мастер системы', 'Воин кода', 'ИИ-архитектор', 'Легенда кода',
  'Мастер-инженер', 'Архитектор империи', 'Системный инженер', 'Алхимик кода', 'Цифровой мудрец',
  'Великий архитектор', 'Титан кода', 'Повелитель систем', 'Стратег', 'Разрушитель легаси', 'Бессмертный кодер',
  'Цифровой мастер', 'Архитектор миров', 'Чемпион кода', 'Гроссмейстер', 'ЛЕГЕНДА',
];
```

`src/game/levels.ts`: replace the inline array with `import { TITLES_EN, TITLES_RU } from '../i18n/titles.js'; import type { Lang } from '../i18n/index.js';` and

```ts
export const TITLES: readonly string[] = TITLES_EN;

export function titleForLevel(level: number, lang: Lang = 'en'): string {
  const index = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level))) - 1;
  return (lang === 'ru' ? TITLES_RU : TITLES_EN)[index] ?? 'Newcomer';
}

export function hudTitle(level: number, lang: Lang = 'en'): string {
  return titleForLevel(level, lang).toUpperCase();
}
```

(`import type` from `i18n/index.js` is type-only, so there is no runtime cycle. `levelProgress` keeps returning the English `title`.)

`src/i18n/index.ts`:

```ts
import { en } from './en.js';
import { ru } from './ru.js';

export type Lang = 'en' | 'ru';
export const LANGS: readonly Lang[] = ['en', 'ru'];
export const isLang = (value: unknown): value is Lang => value === 'en' || value === 'ru';
export const LANGUAGE_NAMES: Record<Lang, string> = { en: 'English', ru: 'Русский' };
export const CATALOGS: Record<Lang, Record<string, string>> = { en, ru };

type Vars = Record<string, string | number>;

/** The text of a key: the language, then English, then the key itself; `{name}` placeholders are filled from vars. */
export function t(lang: Lang, key: string, vars: Vars = {}): string {
  const text = CATALOGS[lang][key] ?? en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === undefined ? whole : String(value);
  });
}

export function pluralForm(lang: Lang, n: number): 'one' | 'few' | 'many' {
  if (lang === 'en') return n === 1 ? 'one' : 'many';
  const last = n % 10;
  const lastTwo = n % 100;
  if (last === 1 && lastTwo !== 11) return 'one';
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'few';
  return 'many';
}

/** `tn('ru', 'board.tasks', 3)` looks up `board.tasks.few` and fills `{n}`. */
export function tn(lang: Lang, key: string, n: number, vars: Vars = {}): string {
  return t(lang, `${key}.${pluralForm(lang, n)}`, { ...vars, n });
}
```

`src/i18n/en.ts` / `ru.ts` start with only these keys (later tasks append):

```ts
// en.ts
export const en: Record<string, string> = {
  'lang.now': 'Language: {name} ({code})',
  'lang.bad': 'Unknown language "{value}". Use ru or en.',
  'board.tasks.one': '{n} tasks',
  'board.tasks.few': '{n} tasks',
  'board.tasks.many': '{n} tasks',
};
// ru.ts
export const ru: Record<string, string> = {
  'lang.now': 'Язык: {name} ({code})',
  'lang.bad': 'Неизвестный язык "{value}". Допустимо: ru или en.',
  'board.tasks.one': '{n} задача',
  'board.tasks.few': '{n} задачи',
  'board.tasks.many': '{n} задач',
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/i18n/i18n.test.ts tests/game` — Expected: PASS (the existing level tests still pass).

- [ ] **Step 5: Commit**

```bash
git add src/i18n src/game/levels.ts tests/i18n
git commit -m "feat(i18n): catalogs, t/tn, Russian plurals and level titles"
```

---

### Task 2: Config file and engine language

**Files:**
- Create: `src/storage/config.ts`
- Modify: `src/storage/paths.ts` (add `configFile`), `src/engine/index.ts`
- Test: `tests/storage/config.test.ts`, `tests/engine/language.test.ts`

**Interfaces:**
- Consumes: `Lang`, `isLang` (Task 1); `readJson`, `writeJsonAtomic` (`src/storage/atomic.ts`).
- Produces:
  - `configFile(home: string): string` → `<home>/config.json`
  - `readLanguage(home: string): Promise<Lang>` (never throws; `'en'` on missing/broken/unknown)
  - `writeLanguage(home: string, lang: Lang): Promise<void>`
  - `ProjectView.lang: Lang`
  - `Engine.language(): Promise<Lang>`, `Engine.setLanguage(lang: Lang): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`tests/storage/config.test.ts`:

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { configFile, readLanguage, writeLanguage } from '../../src/storage/config.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

describe('config.json', () => {
  it('defaults to English, and remembers a written language', async () => {
    const home = await makeTempDir();
    expect(await readLanguage(home)).toBe('en');
    await writeLanguage(home, 'ru');
    expect(await readLanguage(home)).toBe('ru');
    expect(JSON.parse(await readFile(configFile(home), 'utf8'))).toEqual({ schema: 1, language: 'ru' });
  });

  it('a broken file or a wrong value means English, and a new write repairs it', async () => {
    const home = await makeTempDir();
    await writeFile(configFile(home), '{not json');
    expect(await readLanguage(home)).toBe('en');
    await writeFile(configFile(home), JSON.stringify({ schema: 1, language: 5 }));
    expect(await readLanguage(home)).toBe('en');
    await writeLanguage(home, 'ru');
    expect(await readLanguage(home)).toBe('ru');
  });
});
```

`tests/engine/language.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

describe('engine language', () => {
  it('a view carries the language; a switch made by another engine shows at the next request', async () => {
    const root = await copyFixture('projects/nextjs-shop');
    const home = await makeTempDir();
    const make = () => new Engine({ home, cwd: root, now: () => new Date() });
    const one = make();
    expect((await one.view({})).lang).toBe('en');
    await make().setLanguage('ru');
    expect(await one.language()).toBe('ru');
    expect((await one.view({})).lang).toBe('ru');
    expect((await one.verify({})).lang).toBe('ru');
    expect((await one.refresh({}, false)).lang).toBe('ru');
    await one.setLanguage('en');
    expect((await one.view({})).lang).toBe('en');
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/storage/config.test.ts tests/engine/language.test.ts` → FAIL (missing module / property).

- [ ] **Step 3: Implement**

`src/storage/paths.ts`: `export const configFile = (home: string): string => path.join(home, 'config.json');`

`src/storage/config.ts`:

```ts
import { isLang, type Lang } from '../i18n/index.js';
import { readJson, writeJsonAtomic } from './atomic.js';
import { configFile, SCHEMA } from './paths.js';

export { configFile };

/** The language of the user's setting; anything unreadable is English. Read on every request, never cached. */
export async function readLanguage(home: string): Promise<Lang> {
  const result = await readJson(configFile(home));
  if (result.status !== 'ok' || typeof result.value !== 'object' || result.value === null) return 'en';
  const { language } = result.value as { language?: unknown };
  return isLang(language) ? language : 'en';
}

export function writeLanguage(home: string, language: Lang): Promise<void> {
  return writeJsonAtomic(configFile(home), { schema: SCHEMA, language });
}
```

`src/engine/index.ts`: import `readLanguage`, `writeLanguage` and `type Lang`; add `lang: Lang;` to `ProjectView`; add methods

```ts
  /** The language setting, read from the data folder each time so a switch made elsewhere shows at once. */
  language(): Promise<Lang> {
    return readLanguage(this.env.home);
  }

  setLanguage(lang: Lang): Promise<void> {
    return writeLanguage(this.env.home, lang);
  }
```

Change `toView(result, busy)` to `toView(result, busy, lang)` (adds `lang` to the returned object), and every call site to `toView(await this.enqueue(...), false, await this.language())`; in `saved()` add `lang: await this.language()`.

- [ ] **Step 4: Run to verify they pass** — same command → PASS; then `npx vitest run tests/engine` (existing engine tests still pass).

- [ ] **Step 5: Commit**

```bash
git add src/storage src/engine tests/storage/config.test.ts tests/engine/language.test.ts
git commit -m "feat(i18n): language setting in config.json, read per request by the engine"
```

---

### Task 3: HUD, stat labels, level titles and notifications

**Files:**
- Modify: `src/hud/hud.ts`, `src/hud/notifications.ts`, `src/i18n/en.ts`, `src/i18n/ru.ts`
- Test: `tests/hud/hud.test.ts`

**Interfaces:**
- Consumes: `Lang`, `t`, `tn` (Task 1); `hudTitle(level, lang)` (Task 1).
- Produces:
  - `formatHud(xp: number, stats: Stats, lang?: Lang): string`, `formatMinimal(xp: number, lang?: Lang): string`
  - `statLabel(lang: Lang, name: string): string` (replaces direct use of `STAT_LABELS` in the other modules; `STAT_LABELS` stays exported as the English map)
  - `notificationLine(event: GameEvent, lang?: Lang): string | null`, `notificationLines(events: readonly GameEvent[], lang?: Lang): string[]`

- [ ] **Step 1: Write the failing tests** (append to `tests/hud/hud.test.ts`; `STATS`, `event` are already defined there)

```ts
describe('HUD in Russian', () => {
  it('draws the frame with Russian words and title, the numbers unchanged', () => {
    expect(formatHud(3240, STATS, 'ru')).toBe(
      ['⚔️ УР. 7 · АНАЛИТИК', '███████░░░░░░░ 48% (240/500)', '🧠 61 🧪 83 🛡️ 91', '⚡ 78 🧹 69 🐛 3'].join('\n'),
    );
    expect(formatMinimal(3240, 'ru')).toBe('⚔️ УР. 7 · АНАЛИТИК · 3,240 XP');
    expect(formatHud(3240, STATS)).toBe(formatHud(3240, STATS, 'en'));
  });

  it('says МАКС at level 50', () => {
    expect(formatHud(30000, STATS, 'ru')).toContain('МАКС');
    expect(formatHud(30000, STATS)).toContain('MAX');
  });

  it('notifications follow the language', () => {
    expect(notificationLine(event('level_up', { from: 17, to: 18 }), 'ru')).toBe('⚔️ НОВЫЙ УРОВЕНЬ 17 → 18 · Убийца боссов');
    expect(notificationLine(event('quest_completed', { title: 'T', xp: 150, stat: { name: 'testing', from: 40, to: 42 } }), 'ru')).toBe(
      '✓ T: выполнено · +150 XP · Тестирование 40 → 42',
    );
    expect(notificationLine(event('quest_completed', { title: 'T', xp: 150 }))).toBe('✓ T complete · +150 XP');
    expect(notificationLine(event('epic_progress', { title: 'E', subtask: 'S', left: 2 }), 'ru')).toBe(
      '◐ E: S готово · осталось 2',
    );
    const many = Array.from({ length: 8 }, () => event('level_up', { from: 1, to: 2 }));
    expect(notificationLines(many, 'ru').at(-1)).toBe('ещё 4');
    expect(notificationLines(many).at(-1)).toBe('+4 more');
  });
});
```


- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/hud/hud.test.ts` → FAIL.

- [ ] **Step 3: Implement**

Catalog keys (append to both files):

| key | en | ru |
|---|---|---|
| `hud.lvl` | `LVL` | `УР.` |
| `hud.max` | `MAX` | `МАКС` |
| `stat.architecture` | `Architecture` | `Архитектура` |
| `stat.testing` | `Testing` | `Тестирование` |
| `stat.security` | `Security` | `Безопасность` |
| `stat.performance` | `Performance` | `Производительность` |
| `stat.cleanCode` | `Clean Code` | `Чистота кода` |
| `stat.reliability` | `Reliability` | `Надёжность` |
| `stat.maintainability` | `Maintainability` | `Сопровождаемость` |
| `stat.bugs` | `Bugs` | `Баги` |
| `stat.techDebt` | `Tech Debt` | `Техдолг` |
| `notif.complete` | `✓ {title} complete · +{xp} XP{change}` | `✓ {title}: выполнено · +{xp} XP{change}` |
| `notif.epic` | `◐ {title}: {subtask} done · {left} left` | `◐ {title}: {subtask} готово · осталось {left}` |
| `notif.levelup` | `⚔️ LEVEL UP {from} → {to} · {title}` | `⚔️ НОВЫЙ УРОВЕНЬ {from} → {to} · {title}` |
| `notif.returned` | `↩ A fixed problem is back: {rule}` | `↩ Исправленная проблема вернулась: {rule}` |
| `notif.returnedIn` | ` in {file}` | ` в {file}` |
| `notif.more` | `+{n} more` | `ещё {n}` |

`hud.ts`: `formatMinimal(xp, lang = 'en')` returns `` `⚔️ ${t(lang,'hud.lvl')} ${progress.level} · ${hudTitle(progress.level, lang)} · ${grouped(xp)} XP` ``; `formatHud(xp, stats, lang = 'en')` uses `t(lang,'hud.lvl')` in line 1 and `t(lang,'hud.max')` in place of `MAX`.

`notifications.ts`: add `export const statLabel = (lang: Lang, name: string): string => (name in STAT_LABELS ? t(lang, \`stat.${name}\`) : name);` and use it in place of `STAT_LABELS[...] ?? name` (three places); every literal in `notificationLine` becomes `t(lang, 'notif.…', {…})` (`change` is built as ` · ${statLabel(...)} ${from} → ${to}`); `finding_returned` = `t('notif.returned',{rule}) + (file === '' ? '' : t('notif.returnedIn',{file}))`; `analysis` line keeps `📈 …` with `statLabel`; `notificationLines(events, lang = 'en')` passes `lang` through and ends with `t(lang, 'notif.more', { n: lines.length - keep })`. `level_up` uses `hudTitle(num(data.to), lang)`.

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/hud tests/i18n` → PASS (English tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/hud/hud.ts src/hud/notifications.ts src/i18n tests/hud/hud.test.ts
git commit -m "feat(i18n): HUD, stat labels, titles and notifications in Russian"
```

---

### Task 4: Quest frames, report, stats, state, level text and settings text

**Files:**
- Modify: `src/hud/quests.ts`, `src/hud/report.ts`, `src/hud/present.ts`, `src/i18n/en.ts`, `src/i18n/ru.ts`
- Test: `tests/hud/hud.test.ts` (append), `tests/engine/language.test.ts` (append)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces (all with a trailing `lang: Lang = 'en'` except where noted):
  - `formatBoard(projectName, level, quests, lang?)`, `formatQuestCard(quest, level, check?, lang?)`
  - `formatReport(items, lang?)`, `formatStats(stats, findings, limit?, lang?)`, `formatState(input & { lang?: Lang })`
  - `present.ts`: `stateText/hudText/boardText/statsText/levelText/questText/verifyText/refreshText/settingsText` read `view.lang`.
  - `categoryLabel(lang: Lang, category: string): string`, `difficultyLabel(lang: Lang, difficulty: Quest['difficulty']): string` (exported from `quests.ts`, reused by the board UI).

- [ ] **Step 1: Write the failing tests** (append to `tests/hud/hud.test.ts`; `quest()` helper exists)

```ts
describe('quest frames in Russian', () => {
  it('the board keeps its columns and speaks Russian; English is unchanged', () => {
    const q = quest();
    const ru = formatBoard('shop', 3, [q], 'ru');
    expect(ru).toContain('ДОСКА КВЕСТОВ · shop · УР. 3 КОДЕР');
    expect(ru).toContain('Средний');
    expect(ru).toContain('Тесты');
    expect(formatBoard('shop', 3, [q])).toBe(formatBoard('shop', 3, [q], 'en'));
    expect(formatBoard('shop', 3, [], 'ru')).toContain('Открытых квестов нет');
  });

  it('the card and the report speak Russian', () => {
    const card = formatQuestCard(quest(), 1, undefined, 'ru');
    expect(card).toContain('КВЕСТ Protect Cart');
    expect(card).toContain('Средний');
    const item = { quest: quest(), verdict: { outcome: 'open' as const, results: [], scriptChanged: false }, xp: 0, levelBefore: 1, levelAfter: 1 };
    expect(formatReport([item], 'ru')).toContain('Итог: ЕЩЁ НЕ ВЫПОЛНЕНО');
    expect(formatReport([item])).toContain('Result: NOT DONE YET');
    expect(formatReport([], 'ru')).toBe('Нет открытых квестов для проверки.');
  });

  it('stats speak Russian', () => {
    const text = formatStats(STATS, [], 8, 'ru');
    expect(text).toContain('СТАТЫ');
    expect(text).toContain('Тестирование: 83');
  });
});
```

Append to `tests/engine/language.test.ts`:

```ts
import { boardText, hudText, levelText, refreshText, settingsText, statsText } from '../../src/hud/present.js';

it('the texts of a view follow its language', async () => {
  const root = await copyFixture('projects/nextjs-shop');
  const home = await makeTempDir();
  const engine = new Engine({ home, cwd: root, now: () => new Date() });
  await engine.setLanguage('ru');
  const view = await engine.view({});
  expect(hudText(view)).toContain('УР. 1 · НОВИЧОК');
  expect(boardText(view)).toContain('ДОСКА КВЕСТОВ');
  expect(statsText(view)).toContain('СТАТЫ');
  expect(levelText(view, await engine.profile())).toContain('До уровня 2 осталось 500 XP.');
  expect(settingsText(view)).toContain('НЕ разрешены');
  expect(refreshText(view)).toContain('Анализ');
  await engine.setLanguage('en');
  expect(boardText(await engine.view({}))).toContain('QUEST BOARD');
});
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/hud/hud.test.ts tests/engine/language.test.ts` → FAIL.

- [ ] **Step 3: Implement.** Append these keys to both catalogs, then replace each literal in the listed functions by `t(lang, key, vars)` (the English column is exactly the current string, so English output does not change):

| key | en | ru |
|---|---|---|
| `difficulty.easy` / `.medium` / `.hard` / `.epic` | `Easy` / `Medium` / `Hard` / `Epic` | `Лёгкий` / `Средний` / `Сложный` / `Эпик` |
| `category.bug` … | `Bug`, `Testing`, `Architecture`, `Security`, `Performance`, `Refactoring`, `Cleanup`, `Dependencies`, `Documentation`, `Reliability`, `Maintainability` | `Баг`, `Тесты`, `Архитектура`, `Безопасность`, `Скорость`, `Рефакторинг`, `Уборка`, `Зависимости`, `Документация`, `Надёжность`, `Сопровождение` |
| `board.title` | `QUEST BOARD · {project} · LVL {level} {title}` | `ДОСКА КВЕСТОВ · {project} · УР. {level} {title}` |
| `board.empty` | `No open quests: nothing was found that needs work.` | `Открытых квестов нет: ничего, что требует работы, не найдено.` |
| `card.header` | `QUEST {title} · {id} · {difficulty} · {category} · +{xp} XP` | `КВЕСТ {title} · {id} · {difficulty} · {category} · +{xp} XP` |
| `card.status` | `Status: {status}{xp}` | `Статус: {status}{xp}` |
| `status.open` / `.completed` / `.obsolete` | `open` / `completed` / `obsolete` | `открыт` / `выполнен` / `устарел` |
| `report.none` | `No open quests to check.` | `Нет открытых квестов для проверки.` |
| `report.check` | `CHECK {title} · {id}` | `ПРОВЕРКА {title} · {id}` |
| `report.result` | `Result: {outcome}` | `Итог: {outcome}` |
| `outcome.completed` | `COMPLETE` | `ВЫПОЛНЕНО` |
| `outcome.obsolete` | `OBSOLETE (the code it was about is gone; no XP)` | `УСТАРЕЛО (код, о котором квест, исчез; XP нет)` |
| `outcome.open` | `NOT DONE YET` | `ЕЩЁ НЕ ВЫПОЛНЕНО` |
| `report.scriptChanged` | ` · a test/lint/build script was changed, so the reward is x0.8` | ` · скрипт test/lint/build был изменён, награда ×0.8` |
| `report.paid` | ` (its findings were already paid)` | ` (эти находки уже были оплачены)` |
| `stats.title` | `STATS` | `СТАТЫ` |
| `stats.main` | `Main findings:` | `Главные находки:` |
| `stats.more` | `… and {n} more` | `… и ещё {n}` |
| `severity.critical` / `.high` / `.medium` / `.low` | same words | `критично` / `высокая` / `средняя` / `низкая` |
| `state.busy` | `⏳ A check is running; this is the last saved state.` | `⏳ Идёт проверка; это последнее сохранённое состояние.` |
| `state.type` | `Project type: {packs} · stacks: {stacks}` | `Тип проекта: {packs} · стек: {stacks}` |
| `state.generic` / `state.none` | `generic` / `none` | `общий` / `нет` |
| `state.hot` | `Hot files: {files}` | `Горячие файлы: {files}` |
| `state.commandsAllowed` | `Project commands: allowed` | `Команды проекта: разрешены` |
| `state.commandsDenied` | `Project commands: not allowed (set_project_settings needs the user's consent)` | `Команды проекта: не разрешены (set_project_settings требует согласия пользователя)` |
| `state.skipped` | `Skipped {command}: {reason}` | `Пропущено {command}: {reason}` |
| `state.errors` | `Run errors ({n}):` | `Ошибки запуска ({n}):` |
| `level.line` | `{project}: LVL {level} · {title} · {xp} XP` | `{project}: УР. {level} · {title} · {xp} XP` |
| `level.max` | `MAX level reached; XP keeps counting.` | `Достигнут максимальный уровень; XP продолжает копиться.` |
| `level.toNext` | `{n} XP to level {next}.` | `До уровня {next} осталось {n} XP.` |
| `level.multiplier` | `Quest reward multiplier at this level: x{value}.` | `Множитель награды за квест на этом уровне: ×{value}.` |
| `level.projects` | `Projects (each has its own XP):` | `Проекты (у каждого свой XP):` |
| `level.project` | `- {name}: LVL {level} · {xp} XP` | `- {name}: УР. {level} · {xp} XP` |
| `quest.where` | `Where:` | `Где:` |
| `refresh.line` | `Analysis of {project}: {n} findings.` | `Анализ {project}: находок — {n}.` |
| `refresh.same` | ` Nothing changed since the last analysis.` | ` С прошлого анализа ничего не изменилось.` |
| `refresh.newQuests` | `New quests: {titles}` | `Новые квесты: {titles}` |
| `refresh.errors` | `Run errors: {errors}` | `Ошибки запуска: {errors}` |
| `settings.denied` | `Project commands are NOT allowed. Nothing from the project will be run.` | `Команды проекта НЕ разрешены. Ничего из проекта запущено не будет.` |
| `settings.allowed` | `Project commands are allowed (timeout {sec}s). CodeQuest may run: {list}.` | `Команды проекта разрешены (таймаут {sec} с). CodeQuest может запускать: {list}.` |
| `settings.none` | `none found` | `не найдено` |

Code changes:
- `quests.ts`: add `categoryLabel = (lang, category) => (\`category.${category}\` in CATALOGS.en ? t(lang, \`category.${category}\`) : capitalize(category))` and `difficultyLabel = (lang, d) => t(lang, \`difficulty.${d}\`)`. In `formatBoard` the label column is `difficultyLabel(...).padEnd(labelWidth)` where `labelWidth = Math.max(...(['easy','medium','hard','epic'] as const).map((d) => [...difficultyLabel(lang, d)].length))` (6 in English, 7 in Russian); the kind is `quest.difficulty === 'epic' ? tn(lang, 'board.tasks', n) : categoryLabel(lang, quest.category)`. `formatQuestCard` builds its first line from `card.header` and its status line from `card.status` (`xp` = ` · +${xpAwarded} XP` or empty). `shortId`, `rewardOf`, `describeCriterion` are unchanged (stage 2).
- `report.ts`: `OUTCOME` becomes `outcomeText(lang, outcome)`; `formatReport(items, lang = 'en')`, `formatItem(item, lang)`; `Result:` line = `t(lang,'report.result',{outcome})`; level-up line = `t(lang,'notif.levelup',{from,to,title: hudTitle(levelAfter, lang)})`; `formatStats(stats, findings, limit = 8, lang = 'en')` uses `stats.title`, `statLabel(lang, name)`, `severity.*` inside the brackets, `stats.main`, `stats.more`; the category label in a finding line is `statLabel(lang, CATEGORY_STAT_KEY[finding.category])` where `CATEGORY_STAT_KEY` maps `architecture→architecture, security→security, performance→performance, 'clean-code'→cleanCode, reliability→reliability, maintainability→maintainability, testing→testing, bug→bugs` (unmapped categories keep the raw category). `formatState(input)` gets `lang?: Lang` in `StateInput` and uses the `state.*` keys; `hudTitle` in the report uses `lang`.
- `present.ts`: every function takes its language from `view.lang`; `stateText` passes `lang: view.lang`; `levelText`/`refreshText`/`settingsText`/`questText`/`verifyText` use the `level.*`, `refresh.*`, `settings.*`, `quest.where`, `stats.more`, `state.skipped` keys. `hudText(view, minimal)` → `formatMinimal(xp, view.lang)` / `formatHud(xp, stats, view.lang)`.

- [ ] **Step 4: Run to verify they pass** — `npx vitest run tests/hud tests/engine tests/server tests/cli` → PASS (every English assertion unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/hud src/i18n tests/hud tests/engine/language.test.ts
git commit -m "feat(i18n): board, card, report, stats, state and level texts in Russian"
```

---

### Task 5: The interactive board follows the language; key L

**Files:**
- Modify: `src/hud/board-ui.ts`, `src/cli/board.ts`, `src/i18n/en.ts`, `src/i18n/ru.ts`
- Test: `tests/hud/board-ui.test.ts`, `tests/cli/board.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4; `Engine.setLanguage`, `ProjectView.lang`.
- Produces:
  - `RenderOptions.lang?: Lang` (default `'en'`) for `renderList`; `renderCard(quest, { level, color, detail?, lang? })`
  - `Key` gains `'language'`; `parseKey('l' | 'L') → 'language'`; `BoardAction` gains `{ type: 'language' }`
  - `step` returns `{ type: 'language' }` for that key in both modes.

- [ ] **Step 1: Write the failing tests**

Append to `tests/hud/board-ui.test.ts`:

```ts
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
```

Append to `tests/cli/board.test.ts` (inside the `describe`), a second test:

```ts
  it('L switches the whole screen to Russian and back, and the setting is saved', async () => {
    const root = await copyFixture('projects/nextjs-shop');
    const home = await makeTempDir();
    const engine = new Engine({ home, cwd: root, now: () => new Date() });
    const { term, press, shows } = fakeTerminal();
    const done = runBoard(engine, {}, term, { intervalMs: 3_600_000 });
    await shows('Clean Inventory');
    press('l');
    await shows('УР. 1');
    await shows('↑↓ выбор');
    expect(await engine.language()).toBe('ru');
    press('l');
    await shows('↑↓ choose');
    expect(await engine.language()).toBe('en');
    press('q');
    await done;
  }, 90_000);
```


- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/hud/board-ui.test.ts tests/cli/board.test.ts` → FAIL.

- [ ] **Step 3: Implement.** Keys (append to both catalogs):

| key | en | ru |
|---|---|---|
| `ui.inProgress` | `● IN PROGRESS` | `● В РАБОТЕ` |
| `ui.help` | `↑↓ choose · Enter open · V check · R refresh · L language · Q quit` | `↑↓ выбор · Enter открыть · V проверить · R обновить · L язык · Q выход` |
| `ui.cardTake` | `Enter take it to work · V check · Esc back` | `Enter взять в работу · V проверить · Esc назад` |
| `ui.cardTaken` | `V check · Esc back` | `V проверить · Esc назад` |
| `ui.loading` | `Loading…` | `Загрузка…` |
| `ui.taken` | `● Taken to work: {title}. Do the work, then press V to check it.` | `● Взято в работу: {title}. Сделай работу и нажми V для проверки.` |
| `ui.checking` | `Checking…` | `Проверяю…` |
| `ui.notDone` | `✗ Not done yet: the conditions above show what is missing.` | `✗ Пока не выполнено: условия выше показывают, чего не хватает.` |
| `ui.analysing` | `Analysing…` | `Анализирую…` |
| `ui.refreshed` | `Refreshed.` | `Обновлено.` |

`board-ui.ts`: `parseKey` gets `case 'l': case 'L': return 'language';`; `Key`/`BoardAction` extended; `step` handles `'language'` next to `'refresh'` (`return { ui: base, action: { type: 'language' } }`, before the mode split); `renderList` and `renderCard` take `lang` (`options.lang ?? 'en'`) and use `t(lang, 'ui.…')`, `tn(lang, 'board.tasks', n)`, `categoryLabel`, `difficultyLabel` and the same dynamic label width as `formatBoard`; the taken marker is `'  ' + t(lang, 'ui.inProgress')`; `board.empty` for the empty list.

`board.ts`: `draw()` passes `lang: view?.lang ?? 'en'` to `renderList`/`renderCard` and uses `t(lang,'ui.loading')`; the messages (`Taken to work…`, `Checking…`, `Not done yet…`, `Analysing…`, `Refreshed.`, `Loading…`) become `t(lang, 'ui.…')` using the language of the last view; `notificationLines(next.events, next.lang)`; new action in `perform`:

```ts
      } else if (action.type === 'language') {
        const current = await engine.language();
        await engine.setLanguage(current === 'ru' ? 'en' : 'ru');
        use(await engine.view(request));
      }
```

(the message after the switch is empty; the redraw itself is the confirmation).

- [ ] **Step 4: Run to verify they pass** — `npx vitest run tests/hud/board-ui.test.ts tests/cli/board.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hud/board-ui.ts src/cli/board.ts src/i18n tests/hud/board-ui.test.ts tests/cli/board.test.ts
git commit -m "feat(i18n): the board speaks both languages; key L switches"
```

---

### Task 6: MCP tool `set_language`, CLI `codequest lang`, usage, notifications in the tools

**Files:**
- Modify: `src/tools/register.ts`, `src/cli/run.ts`, `src/cli/index.ts` (only if it prints USAGE), `src/engine/index.ts` (`notifications` uses the language), `src/i18n/en.ts`, `src/i18n/ru.ts`
- Test: `tests/server/tools.test.ts`, `tests/cli/run.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - MCP tool `set_language` with input `{ language?: 'ru' | 'en' }`; result text `t(lang,'lang.now',{name,code})`, `structuredContent: { language }`.
  - CLI `codequest lang [ru|en]`.
  - `usage(lang: Lang): string`; `USAGE` stays exported as `usage('en')`.

- [ ] **Step 1: Write the failing tests.** Read the two existing files first and follow their helpers. In `tests/server/tools.test.ts` add: (a) the tools list contains `set_language` (and now has 9 tools — update the existing count assertion if there is one); (b) calling it without arguments returns `Language: English (en)`; with `{ language: 'ru' }` returns `Язык: Русский (ru)`, and the next `get_player_level` text contains `УР.`; with `{ language: 'de' }` the call is rejected by the schema (isError or protocol error, whichever the SDK client reports); switching back to `en` restores English. In `tests/cli/run.test.ts` add:

```ts
  it('lang prints and switches the language; an unknown one is an error', async () => {
    const { project, out, err, run } = await setup();
    expect(await run('lang')).toBe(0);
    expect(out.join('')).toBe('Language: English (en)\n');
    out.length = 0;
    expect(await run('lang', 'ru')).toBe(0);
    expect(out.join('')).toBe('Язык: Русский (ru)\n');
    out.length = 0;
    await run('hud', '--path', project);
    expect(out.join('')).toContain('УР. 1 · НОВИЧОК');
    expect(await run('lang', 'de')).toBe(1);
    expect(err.join('')).toContain('Неизвестный язык "de"');
    out.length = 0;
    expect(await run('lang')).toBe(0);
    expect(out.join('')).toBe('Язык: Русский (ru)\n');
  });
```

(The error message is printed in the language that is currently set, here Russian.)

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/server tests/cli/run.test.ts` → FAIL.

- [ ] **Step 3: Implement.**
  - Catalog keys (both): `usage.header` (`Usage:` / `Использование:`), `usage.mcp`, `usage.refresh`, `usage.verify`, `usage.hud`, `usage.board`, `usage.lang`, `usage.home` — English = the current USAGE lines (plus `  codequest lang [ru|en]                     show or set the language (ru or en)`), Russian = the same lines translated, keeping the command names and the column alignment. `usage(lang)` joins them; `export const USAGE = usage('en')`.
  - `run.ts`: `runCli` accepts `lang` as a fifth command. It does not build an `Engine`: `home = resolveHome(...)`; without an argument it prints `t(current,'lang.now',…)`; with `ru`/`en` it calls `writeLanguage` and prints in the **new** language; anything else prints `t(current,'lang.bad',{value})` to stderr and returns 1. Error output of the other commands (`codequest: …`) is unchanged; the usage text on a bad command is printed with `usage(await readLanguage(home))`.
  - `register.ts`: register `set_language` after `set_project_settings`:

```ts
  server.registerTool(
    'set_language',
    {
      title: 'Set language',
      description:
        'Switch the language of all CodeQuest output (HUD, quest board, reports, notifications) to Russian (ru) or English (en), or show the current one when called without arguments. The setting is global and applies at once.',
      inputSchema: { language: z.enum(['ru', 'en']).optional().describe('ru or en; omit to just read the setting.') },
    },
    async ({ language }) => {
      try {
        if (language !== undefined) await engine.setLanguage(language);
        const current = await engine.language();
        return {
          content: [{ type: 'text', text: t(current, 'lang.now', { name: LANGUAGE_NAMES[current], code: current }) }],
          structuredContent: { language: current },
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );
```

  - `Engine.notifications(project)` reads `await this.language()` and passes it to `notificationLines`.

- [ ] **Step 4: Run to verify they pass** — `npx vitest run tests/server tests/cli tests/engine` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools src/cli src/engine src/i18n tests/server tests/cli/run.test.ts
git commit -m "feat(i18n): set_language tool, codequest lang and a translated usage"
```

---

### Task 7: Full check, build, docs, report

**Files:**
- Modify: `ПЛАН.md` (status line and a short "Язык" note), `docs/superpowers/plans/2026-09-29-codequest-roadmap.md` if it lists stages
- Build: `dist/`

- [ ] **Step 1: Run the full check in the background** — `npm run check` (3–5 minutes; redirect to `.tmp/check.log`). Expected: typecheck, lint and all tests green; the number of tests is the previous 511 plus the new ones.
- [ ] **Step 2: Fix anything red**, rerun until green (`npx biome check --write .` first for formatting).
- [ ] **Step 3: Rebuild** — `npm run build`, then a manual check from Git Bash with `CODEQUEST_HOME=D:\Claude\codequest-data`: `node dist/cli/index.js lang ru`, `node dist/cli/index.js hud`, `node dist/cli/index.js board`, `node dist/cli/index.js lang en`. The user's real data folder is switched to English again at the end.
- [ ] **Step 4: Update `ПЛАН.md`** with one line: stage 1 of the language work is done; quest texts (stage 2) and check reasons (stage 3) are still English.
- [ ] **Step 5: Commit**

```bash
git add ПЛАН.md docs
git commit -m "docs: mark i18n stage 1 done"
```

- [ ] **Step 6: Report to the user** (short, plain): what is switchable now, that the quest titles, descriptions, condition lines and check reasons are still English until stages 2–3, the real test count, what was not tried (live terminal, the MCP tool from a new Claude session — the server must be reconnected/restarted to see the new tool), and how to switch (`codequest lang ru`, key L, "переключи CodeQuest на русский").
