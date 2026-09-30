# CodeQuest i18n, stage 2: quest texts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quest titles, descriptions and condition lines follow the language setting (ru / en) and switch at any moment, with no change to XP, ids or the stored progress format that older data cannot read.

**Architecture:** Every quest text is a catalog entry keyed by the quest's template id (`quest.<template>.title` / `.desc`) and filled from a small set of text variables stored on the quest (`Quest.vars`). The English strings stored in `title`/`description` are produced from the same catalog, so English has one source. For another language the text is rendered at show time from `template` + `vars`; if a key or `vars` is missing the stored English is shown. Open quests without `vars` (made before this stage) get them on the next cycle from the fresh candidates with the same id.

**Tech Stack:** TypeScript strict, Vitest, Biome (already in the repo). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-30-i18n-design.md`, section "Quest texts". Ruling recorded here: the spec sketches `text: { title: {key, vars}, description: {key, vars} }`; because the key is always derived from the template id, only the variables are stored (`vars`). Same behaviour, less data.

## Global Constraints

- English output stays byte-for-byte what it is now: every existing test passes unchanged. The stored `title`, `description` and `criteria` of English quests do not change, and quest ids do not change (they hash the template id and the finding ids, not the text).
- A missing `ru` key or missing `vars` renders the stored English text; nothing throws.
- The catalog parity test (Task 1 of stage 1) is relaxed for keys starting with `quest.` and `subject.`: the Russian text may use the placeholders `{s}` (genitive), `{sa}` (accusative), `{si}` (locative) that English does not use; every placeholder of either language must belong to the allowed set `s, sa, si, stem, cycle, n, dir, titles`, and every placeholder English uses must also be available in Russian.
- Not translated here: finding messages and check reasons (`CriterionResult.detail`, stage 3), rule ids, file names, commands, error messages.
- All work and data on drive D. No push.

## Review Focus

- A quest batched over several files whose folder is the project root, a single folder, or different folders (`root`, `dir`, `files` subjects) reads correctly in Russian in each case ("в корневой папке", "в 3 файлах", "в src/").
- A quest with a template but no `vars` (old data) renders in English in Russian mode, and gets its `vars` at the next cycle.
- An epic made before this stage (no `vars`) renders its title in Russian (Checkout Master, Command Center, "Fortify src/") after the backfill.
- `findQuest` finds a quest by its Russian title as well as by the English one, and reports ambiguity the same way.
- A notification about a quest completed in `en` mode and shown later in `ru` mode is in Russian when the event carries `vars`, and in English when it is an old event without them.
- Russian titles are wider: the board list, card and report still respect the width (existing width tests run with `ru`).

## File structure

- Create `src/game/quests/text.ts` — `TextVars`, `groupVars`, `renderVars`, `templateText`, `questTitle`, `questDescription`, `backfillVars`.
- Create `src/i18n/quests-en.ts`, `src/i18n/quests-ru.ts` — the quest and subject catalog entries, spread into `en.ts` / `ru.ts`.
- Modify `src/types.ts` (`Quest.vars`, event data), `src/game/quests/templates.ts` (drop the title/describe lambdas), `generate.ts`, `board.ts` (epics, `findQuest`), `src/engine/cycle.ts` (backfill, events), `src/hud/{quests,report,notifications,present,board-ui}.ts`, `src/cli/board.ts`, `src/tools/register.ts` (titles in tool data stay English).
- Tests: `tests/game/quests-text.test.ts`, extend `tests/i18n/i18n.test.ts`, `tests/hud/hud.test.ts`, `tests/hud/board-ui.test.ts`, `tests/engine/language.test.ts`.

## The catalog (the content of Tasks 1–2)

English texts are exactly the current strings; `{s}` is the subject. Russian uses `{s}` after "для / из", `{sa}` after verbs that take the accusative, `{si}` after "в". Keys are `quest.<id>.title` and `quest.<id>.desc`.

| id | en title | en desc | ru title | ru desc |
|---|---|---|---|---|
| protect-cart | Protect Cart | Add tests for {s}: at least 3 test cases that import it. | Защита корзины | Добавь тесты для {s}: не менее 3 тест-кейсов, которые её импортируют. |
| payment-guardian | Payment Guardian | (same as protect-cart) | Страж платежей | (same as protect-cart, ru) |
| validate-payment-webhooks | Validate Payment Webhooks | Verify the signature of every request in {s} before trusting the event. | Проверка вебхуков оплаты | Проверяй подпись каждого запроса в {si}, прежде чем доверять событию. |
| clean-inventory | Clean Inventory | Remove the unused product component {s}. | Чистка каталога | Удали неиспользуемые компоненты товара: {sa}. |
| handle-api-errors | Handle API Errors | Register a global error handler so one failing update cannot stop the bot. | Обработка ошибок API | Добавь глобальный обработчик ошибок, чтобы одно упавшее обновление не остановило бота. |
| guard-admin-commands | Guard Admin Commands | Check permissions before running the admin command in {s}. | Защита админ-команд | Проверь права перед выполнением админ-команды в {si}. |
| test-message-parsing | Test Message Parsing | (test description) | Тесты разбора сообщений | (test description, ru) |
| improve-command-routing | Improve Command Routing | Split the handler registrations of {s} into routers or modules. | Улучшение маршрутизации команд | Раздели регистрацию обработчиков в {si} на роутеры или модули. |
| add-retry-logic | Add Retry Logic | Give the HTTP calls in {s} a timeout (and retry where it makes sense). | Повторы и таймауты | Добавь таймаут (и повтор, где это уместно) для HTTP-вызовов в {si}. |
| protect-the-token | Protect the Token | Move the bot token out of {s} into an environment variable. | Защита токена | Вынеси токен бота из {s} в переменную окружения. |
| clean-up-todos | Clean Up TODOs | Resolve or remove the TODO comments in {s}. | Уборка TODO | Реши или удали TODO-комментарии в {si}. |
| remove-dead-code | Remove Dead Code | Delete {s}: nothing imports it and it is not an entry point. | Удаление мёртвого кода | Удали {sa}: код нигде не импортируется и не является точкой входа. |
| split-large-file | Split Large File | Split {s} into smaller modules. | Разбиение большого файла | Раздели {sa} на более мелкие модули. |
| break-import-cycle | Break Import Cycle | Break the import cycle through {cycle}. | Разрыв цикла импортов | Разорви цикл импортов через {cycle}. |
| remove-hardcoded-secret | Remove Hardcoded Secret | Move the secret out of {s} and rotate it. | Секрет в коде | Вынеси секрет из {s} и смени его. |
| deduplicate-code | Deduplicate Code | Extract the duplicated block in {s} into one place. | Устранение дублей | Вынеси повторяющийся блок в {si} в одно место. |
| add-test-command | Add Test Command | Add a test script so the project can run its tests with one command. | Команда для тестов | Добавь скрипт test, чтобы тесты проекта запускались одной командой. |
| write-first-tests | Write First Tests | Add the first test file with at least 3 test cases. | Первые тесты | Добавь первый файл с тестами: не менее 3 тест-кейсов. |
| add-tests-for-module | Add Tests for {stem} | (test description) | Тесты для {stem} | (test description, ru) |
| fix-failing-tests | Fix Failing Tests | Make the failing tests pass. | Починка упавших тестов | Сделай так, чтобы упавшие тесты проходили. |
| write-readme | Write README | Write a README of at least 10 lines: what the project does and how to run it. | Написать README | Напиши README не короче 10 строк: что делает проект и как его запустить. |
| document-environment | Document Environment | Add a .env.example that lists the environment variables the code reads. | Описание окружения | Добавь .env.example со списком переменных окружения, которые читает код. |
| lock-dependencies | Lock Dependencies | Commit a lock file so installs are reproducible. | Фиксация зависимостей | Закоммить lock-файл, чтобы установки были воспроизводимыми. |
| protect-env | Protect .env | Stop tracking .env in git and add it to .gitignore. | Защита .env | Перестань отслеживать .env в git и добавь его в .gitignore. |
| remove-suppressions | Remove Suppressions | Fix the problems hidden by suppression comments in {s}. | Убрать подавления | Исправь проблемы, скрытые комментариями-подавлениями в {si}. |
| revive-skipped-tests | Revive Skipped Tests | Re-enable the skipped tests in {s}. | Вернуть пропущенные тесты | Включи обратно пропущенные тесты в {si}. |
| handle-errors-in-file | Handle Errors in {s} | Handle or log the swallowed errors in {s}. | Обработка ошибок в {si} | Обработай или залогируй проглоченные ошибки в {si}. |
| sanitize-html | Sanitize HTML | Sanitize the HTML before it reaches dangerouslySetInnerHTML in {s}. | Очистка HTML | Очищай HTML, прежде чем он попадёт в dangerouslySetInnerHTML в {si}. |
| remove-eval | Remove eval | Replace dynamic code execution in {s} with a safe alternative. | Убрать eval | Замени динамическое выполнение кода в {si} безопасной альтернативой. |
| async-file-access | Async File Access | Use async file access inside the handlers of {s}. | Асинхронный доступ к файлам | Используй асинхронный доступ к файлам внутри обработчиков в {si}. |
| optimize-images | Optimize Images | Use next/image instead of a raw img tag in {s}. | Оптимизация картинок | Используй next/image вместо обычного тега img в {si}. |
| remove-debug-logs | Remove Debug Logs | Remove the console.log calls from {s}. | Убрать отладочные логи | Убери вызовы console.log из {s}. |
| fix-mutable-defaults | Fix Mutable Defaults | Replace mutable default arguments in {s} with None. | Изменяемые аргументы по умолчанию | Замени изменяемые аргументы по умолчанию в {si} на None. |
| unblock-the-event-loop | Unblock the Event Loop | Replace the blocking calls in async code of {s} with async ones. | Разблокировать цикл событий | Замени блокирующие вызовы в асинхронном коде {s} на асинхронные. |

"test description" (used by protect-cart, payment-guardian, test-message-parsing, add-tests-for-module) is one text: en `Add tests for {s}: at least 3 test cases that import it.` / ru `Добавь тесты для {s}: не менее 3 тест-кейсов, которые их импортируют.` — for the four templates write the same string in each `.desc` key (a shared constant in the catalog file, `TEST_DESC_EN` / `TEST_DESC_RU`). Protect-cart's row above uses the same wording.

Epics (keys `quest.<template>.title`, description `quest.epic.desc`):

| key | en | ru |
|---|---|---|
| `quest.epic-checkout-master.title` | Checkout Master | Мастер оформления заказа |
| `quest.epic-command-center.title` | Command Center | Командный центр |
| `quest.epic-fortify.title` | Fortify {dir} | Укрепление {dir} |
| `quest.epic.desc` | Finish all {n} quests: {titles}. | Выполни все {n} квеста: {titles}. |

Subjects (`{s}`/`{sa}`/`{si}` = genitive/accusative/locative):

| key | en | ru |
|---|---|---|
| `subject.root.gen` / `.acc` / `.loc` | the root folder (all three) | корневой папки / корневую папку / корневой папке |
| `subject.project.gen` / `.acc` / `.loc` | the project (all three) | проекта / проект / проекте |
| `subject.files.gen.one` / `.few` / `.many` | {n} files (all) | {n} файла / {n} файлов / {n} файлов |
| `subject.files.acc.one` / `.few` / `.many` | {n} files (all) | {n} файл / {n} файла / {n} файлов |
| `subject.files.loc.one` / `.few` / `.many` | {n} files (all) | {n} файле / {n} файлах / {n} файлах |

---

### Task 1: Text variables, catalog-driven templates (English only, behaviour-preserving)

**Files:**
- Create: `src/game/quests/text.ts`, `src/i18n/quests-en.ts`
- Modify: `src/types.ts`, `src/i18n/en.ts` (spread `questsEn`), `src/game/quests/templates.ts`, `src/game/quests/generate.ts`, `src/game/quests/board.ts` (epics only)
- Test: `tests/game/quests-text.test.ts`, `tests/i18n/i18n.test.ts` (relax parity)

**Interfaces:**
- Consumes: `t`, `tn`, `Lang`, `CATALOGS` from `src/i18n/index.ts`; `Group` from `templates.ts`.
- Produces:
  - `type TextVars = Record<string, string | number>`
  - `Quest.vars?: TextVars` (types.ts)
  - `groupVars(group: Group): TextVars` → `{ sk: 'file'|'dir'|'root'|'files'|'project', sv: string, n: number, stem: string, cycle: string }`
  - `renderVars(lang: Lang, vars: TextVars): TextVars` → adds `s`, `sa`, `si`, and rewrites `cycle` (empty → the project, accusative)
  - `templateText(lang: Lang, templateId: string, part: 'title' | 'desc', vars: TextVars): string`
  - `Template` no longer has `title` / `describe`.

- [ ] **Step 1: Write the failing tests** `tests/game/quests-text.test.ts`. Build groups by hand and assert the English strings of the catalog table above for representative templates and every subject kind:

```ts
import { describe, expect, it } from 'vitest';
import { groupVars, renderVars, templateText } from '../../src/game/quests/text.js';
import { TEMPLATES, type Group } from '../../src/game/quests/templates.js';
import type { Finding } from '../../src/types.js';

const finding = (file: string | undefined, key = 'k'): Finding => ({
  id: `id-${file ?? 'none'}`, rule: 'generic/todo', category: 'cleanup', severity: 'low', message: 'm', key,
  ...(file === undefined ? {} : { file }),
});
const group = (...files: string[]): Group => ({ findings: files.map((file) => finding(file)), files: [...files].sort() });

describe('group variables', () => {
  it('describe the subject of a group', () => {
    expect(groupVars(group('src/cart.ts'))).toMatchObject({ sk: 'file', sv: 'cart.ts', n: 1, stem: 'cart' });
    expect(groupVars(group('src/a.ts', 'src/b.ts'))).toMatchObject({ sk: 'dir', sv: 'src/', n: 2 });
    expect(groupVars(group('a.ts', 'b.ts'))).toMatchObject({ sk: 'root', n: 2 });
    expect(groupVars(group('a/x.ts', 'b/y.ts', 'c/z.ts'))).toMatchObject({ sk: 'files', n: 3 });
    expect(groupVars({ findings: [], files: [] })).toMatchObject({ sk: 'project', n: 0, stem: '', cycle: '' });
  });
});

describe('English quest texts come from the catalog and equal the old strings', () => {
  const en = (id: string, part: 'title' | 'desc', g: Group) => templateText('en', id, part, groupVars(g));
  it('titles and descriptions', () => {
    expect(en('protect-cart', 'title', group('lib/cart.ts'))).toBe('Protect Cart');
    expect(en('protect-cart', 'desc', group('lib/cart.ts'))).toBe('Add tests for cart.ts: at least 3 test cases that import it.');
    expect(en('add-tests-for-module', 'title', group('lib/cart.ts'))).toBe('Add Tests for cart');
    expect(en('remove-dead-code', 'desc', group('a.ts', 'b.ts'))).toBe('Delete the root folder: nothing imports it and it is not an entry point.');
    expect(en('remove-dead-code', 'desc', group('src/a.ts', 'src/b.ts'))).toBe('Delete src/: nothing imports it and it is not an entry point.');
    expect(en('clean-up-todos', 'desc', group('a/x.ts', 'b/y.ts', 'c/z.ts'))).toBe('Resolve or remove the TODO comments in 3 files.');
    expect(en('handle-errors-in-file', 'title', group('app/x.py'))).toBe('Handle Errors in x.py');
    expect(en('write-readme', 'desc', { findings: [], files: [] })).toBe('Write a README of at least 10 lines: what the project does and how to run it.');
  });
  it('the cycle quest names the file, or the project when there is none', () => {
    const g: Group = { findings: [finding('src/a.ts', 'src/a.ts|src/b.ts')], files: ['src/a.ts'] };
    expect(en('break-import-cycle', 'desc', g)).toBe('Break the import cycle through src/a.ts.');
    expect(en('break-import-cycle', 'desc', { findings: [], files: [] })).toBe('Break the import cycle through the project.');
  });
  it('every template has a title and a description in the catalog', () => {
    for (const template of TEMPLATES) {
      for (const part of ['title', 'desc'] as const) {
        expect(templateText('en', template.id, part, groupVars(group('src/x.ts'))), `${template.id} ${part}`).not.toMatch(/^quest\./);
      }
    }
  });
});
```

In `tests/i18n/i18n.test.ts` replace the strict placeholder-parity assertion by: for keys not starting with `quest.` / `subject.` keep the old equality; for those keys assert `placeholders(ru)` ⊆ `{s, sa, si, stem, cycle, n, dir, titles}` and `placeholders(en)` ⊆ `placeholders(ru) ∪ {s}`… i.e. every English placeholder is either present in Russian or `s` (which Russian may replace by `sa`/`si`). The existing "same keys" tests stay.

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/game/quests-text.test.ts tests/i18n` → FAIL (module missing).

- [ ] **Step 3: Implement.**
  - `src/i18n/quests-en.ts`: `export const questsEn: Record<string, string>` with, for every template of `templates.ts`, `quest.<id>.title` and `quest.<id>.desc` — the English columns of the table (the four test templates share `TEST_DESC_EN`), the four epic keys, and the `subject.*` English keys. Spread it into `en.ts` (`...questsEn`).
  - `src/types.ts`: `vars?: Record<string, string | number>;` on `Quest`, with a comment "variables of the quest texts; the catalog key is derived from `template`".
  - `templates.ts`: delete the `title` and `describe` fields of the `Template` interface and of all 34 templates, and delete the now-unused `subject`, `stem`, `first`, `testDescription` helpers **only if nothing else uses them** (`stem` and `subject` move into `text.ts`; keep `base` if still used).
  - `text.ts` (complete code):

```ts
import path from 'node:path';
import { CATALOGS, type Lang, t, tn } from '../../i18n/index.js';
import type { Quest } from '../../types.js';
import type { Group } from './templates.js';

export type TextVars = Record<string, string | number>;
type Case = 'gen' | 'acc' | 'loc';

const stemOf = (file: string): string => path.posix.basename(file).replace(/\.[^.]+$/, '');

/** What a group of findings is about, kept as data so the text can be worded in any language later. */
export function groupVars(group: Group): TextVars {
  const [first] = group.files;
  let sk = 'project';
  let sv = '';
  if (first !== undefined && group.files.length === 1) {
    sk = 'file';
    sv = path.posix.basename(first);
  } else if (first !== undefined) {
    const dirs = new Set(group.files.map((file) => path.posix.dirname(file)));
    const [dir] = [...dirs];
    if (dirs.size !== 1) sk = 'files';
    else if (dir === '.') sk = 'root';
    else {
      sk = 'dir';
      sv = `${dir}/`;
    }
  }
  return { sk, sv, n: group.files.length, stem: first === undefined ? '' : stemOf(first), cycle: group.findings[0]?.file ?? '' };
}

function subjectIn(lang: Lang, vars: TextVars, form: Case): string {
  const kind = String(vars.sk ?? 'project');
  if (kind === 'file' || kind === 'dir') return String(vars.sv ?? '');
  if (kind === 'files') return tn(lang, `subject.files.${form}`, Number(vars.n ?? 0));
  return t(lang, `subject.${kind}.${form}`);
}

/** The placeholders of a quest text: the subject in three cases, and the rest of the variables as they are. */
export function renderVars(lang: Lang, vars: TextVars): TextVars {
  const cycle = String(vars.cycle ?? '');
  return {
    ...vars,
    s: subjectIn(lang, vars, 'gen'),
    sa: subjectIn(lang, vars, 'acc'),
    si: subjectIn(lang, vars, 'loc'),
    cycle: cycle === '' ? t(lang, 'subject.project.acc') : cycle,
  };
}

export function templateText(lang: Lang, templateId: string, part: 'title' | 'desc', vars: TextVars): string {
  return t(lang, `quest.${templateId}.${part}`, renderVars(lang, vars));
}
```

  - `generate.ts`: `const vars = groupVars(group);` and in the quest literal `title: templateText('en', template.id, 'title', vars)`, `description: templateText('en', template.id, 'desc', vars)`, `vars`. Remove the imports of the deleted helpers.
  - `board.ts` `formEpic`: `Area` gets `vars: TextVars` (`{}` for shop and bot, `{ dir: \`${path.posix.normalize(top)}/\` }` for fortify); `title` = `t('en', \`quest.${area.template}.title\`, area.vars)`; `description` = `t('en', 'quest.epic.desc', { n: EPIC_SIZE, titles: subtasks.map((task) => task.title).join(', ') })`; the epic quest gets `vars: area.vars`. Existing tests on epics must pass unchanged (English strings identical: `Fortify src/`, `Finish all 3 quests: A, B, C.`).

- [ ] **Step 4: Run to verify** — `npx vitest run tests/game tests/i18n tests/engine tests/hud` → PASS; `npx tsc --noEmit`; `npx biome check --write src tests`.

- [ ] **Step 5: Commit** — `git add src tests && git commit -m "refactor(i18n): quest texts come from the catalog, quests keep their text variables"`.

---

### Task 2: Russian catalog for quests

**Files:**
- Create: `src/i18n/quests-ru.ts`
- Modify: `src/i18n/ru.ts` (spread `questsRu`)
- Test: `tests/game/quests-text.test.ts` (append), `tests/i18n/i18n.test.ts`

**Interfaces:**
- Consumes: Task 1 (`templateText`, `groupVars`, catalog keys).
- Produces: `questsRu: Record<string, string>` with a `ru` entry for every key of `questsEn`.

- [ ] **Step 1: Write the failing tests** (append to `tests/game/quests-text.test.ts`):

```ts
describe('Russian quest texts', () => {
  const ru = (id: string, part: 'title' | 'desc', g: Group) => templateText('ru', id, part, groupVars(g));
  it('every template has Russian text, different from the key', () => {
    for (const template of TEMPLATES) {
      for (const part of ['title', 'desc'] as const) {
        const text = ru(template.id, part, group('src/x.ts'));
        expect(text, `${template.id} ${part}`).not.toMatch(/^quest\./);
        expect(text, `${template.id} ${part}`).toMatch(/[А-Яа-яЁё]/);
      }
    }
  });
  it('the subject takes the case the sentence needs', () => {
    expect(ru('clean-up-todos', 'desc', group('src/a.ts'))).toBe('Реши или удали TODO-комментарии в a.ts.');
    expect(ru('clean-up-todos', 'desc', group('a.ts', 'b.ts'))).toBe('Реши или удали TODO-комментарии в корневой папке.');
    expect(ru('clean-up-todos', 'desc', group('a/x.ts', 'b/y.ts', 'c/z.ts'))).toBe('Реши или удали TODO-комментарии в 3 файлах.');
    expect(ru('remove-dead-code', 'desc', group('a.ts', 'b.ts'))).toBe('Удали корневую папку: код нигде не импортируется и не является точкой входа.');
    expect(ru('remove-dead-code', 'desc', group('a/x.ts', 'b/y.ts', 'c/z.ts', 'd/w.ts', 'e/v.ts'))).toBe('Удали 5 файлов: код нигде не импортируется и не является точкой входа.');
    expect(ru('remove-dead-code', 'desc', group('a/x.ts', 'b/y.ts'))).toBe('Удали 2 файла: код нигде не импортируется и не является точкой входа.');
    expect(ru('add-tests-for-module', 'desc', group('lib/cart.ts'))).toContain('Добавь тесты для cart.ts');
    expect(ru('add-tests-for-module', 'title', group('lib/cart.ts'))).toBe('Тесты для cart');
    expect(ru('break-import-cycle', 'desc', { findings: [], files: [] })).toBe('Разорви цикл импортов через проект.');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/game/quests-text.test.ts` → FAIL (the Russian keys are missing, texts fall back to English).
- [ ] **Step 3: Implement** `src/i18n/quests-ru.ts`: every `ru` cell of the catalog tables above, one entry per key (`'quest.protect-cart.title': 'Защита корзины'`, …), the epics, the `subject.*` forms; `TEST_DESC_RU = 'Добавь тесты для {s}: не менее 3 тест-кейсов, которые их импортируют.'` for the four test templates. Spread into `ru.ts`.
- [ ] **Step 4: Run to verify** — `npx vitest run tests/game tests/i18n` → PASS (the parity test now checks every quest key in both languages).
- [ ] **Step 5: Commit** — `feat(i18n): Russian texts of all quest templates`.

---

### Task 3: Showing quest texts by language, backfill of old quests, epics, findQuest

**Files:**
- Modify: `src/game/quests/text.ts` (add `questTitle`, `questDescription`, `backfillVars`), `src/game/quests/board.ts` (`findQuest`), `src/engine/cycle.ts`, `src/engine/index.ts` (`Engine.quest`, `accept`)
- Test: `tests/game/quests-text.test.ts` (append), `tests/game/quests-board.test.ts` (find by Russian title), `tests/engine/language.test.ts` (backfill)

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `questTitle(quest: Quest, lang: Lang): string`, `questDescription(quest: Quest, lang: Lang): string`
  - `backfillVars(open: Quest[], candidates: readonly { quest: Quest }[]): void` (mutates: sets `vars` on open quests, their subtasks and epics that lack it)
  - `findQuest(quests, reference, lang?: Lang)` — the title is matched in English and, when `lang` is given, in that language too.

- [ ] **Step 1: Write the failing tests.**

```ts
describe('questTitle / questDescription', () => {
  const base = (over: Partial<Quest>): Quest => ({ /* a complete Quest as in tests/hud/hud.test.ts */ ...over } as Quest);
  it('English is the stored text; Russian is rendered from template and vars', () => {
    const q = base({ template: 'clean-up-todos', title: 'Clean Up TODOs', description: 'Resolve or remove the TODO comments in a.ts.', vars: groupVars(group('src/a.ts')) });
    expect(questTitle(q, 'en')).toBe('Clean Up TODOs');
    expect(questTitle(q, 'ru')).toBe('Уборка TODO');
    expect(questDescription(q, 'ru')).toBe('Реши или удали TODO-комментарии в a.ts.');
  });
  it('a quest without vars, or with an unknown template, stays English', () => {
    const q = base({ template: 'clean-up-todos', title: 'Clean Up TODOs', description: 'D' });
    expect(questTitle(q, 'ru')).toBe('Clean Up TODOs');
    expect(questTitle(base({ template: 'no-such', title: 'X', vars: {} }), 'ru')).toBe('X');
  });
  it('an epic is worded from its subtasks and its directory', () => {
    const sub = (id: string, template: string) => base({ id, template, title: id, vars: groupVars(group('src/a.ts')) });
    const epic = base({ template: 'epic-fortify', title: 'Fortify src/', difficulty: 'epic', vars: { dir: 'src/' }, subtasks: [sub('s1', 'clean-up-todos'), sub('s2', 'protect-env'), sub('s3', 'write-readme')] });
    expect(questTitle(epic, 'ru')).toBe('Укрепление src/');
    expect(questDescription(epic, 'ru')).toBe('Выполни все 3 квеста: Уборка TODO, Защита .env, Написать README.');
    const old = { ...epic, vars: undefined, template: 'epic-checkout-master', title: 'Checkout Master' };
    expect(questTitle(old, 'ru')).toBe('Мастер оформления заказа');
  });
});

describe('backfillVars', () => {
  it('fills vars of open quests from candidates with the same id, and of old epics from their template and title', () => {
    /* an open quest without vars + a candidate with the same id and vars → vars copied;
       an epic 'epic-fortify' titled 'Fortify src/' without vars → { dir: 'src/' };
       'epic-checkout-master' → {}; a quest that already has vars is left alone */
  });
});
```

  (write the bodies out in full when implementing; the quest fixture helper is the one in `tests/hud/hud.test.ts`). Add to the board test: `findQuest(quests, 'уборка todo', 'ru')` finds the quest, without `lang` it does not; two quests with the same Russian title give the existing "is the title of N quests" error. Add to `tests/engine/language.test.ts`: a shop project view in `ru` shows Russian titles via `questTitle`, and an old state whose open quests have no `vars` (delete `vars` from `state.json` in the test, write it back) gets `vars` again after the next `engine.refresh({}, true)`.

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement.**

```ts
function textOf(quest: Quest, lang: Lang, part: 'title' | 'desc'): string | undefined {
  const epic = quest.template.startsWith('epic-');
  const key = epic && part === 'desc' ? 'quest.epic.desc' : `quest.${quest.template}.${part}`;
  if (!(key in CATALOGS[lang])) return undefined;
  if (epic && part === 'desc') {
    const titles = (quest.subtasks ?? []).map((task) => questTitle(task, lang)).join(', ');
    return t(lang, key, { n: (quest.subtasks ?? []).length, titles });
  }
  if (quest.vars === undefined) return undefined;
  return templateText(lang, quest.template, part, quest.vars);
}

export const questTitle = (quest: Quest, lang: Lang): string =>
  lang === 'en' ? quest.title : (textOf(quest, lang, 'title') ?? quest.title);
export const questDescription = (quest: Quest, lang: Lang): string =>
  lang === 'en' ? quest.description : (textOf(quest, lang, 'desc') ?? quest.description);
```

  `backfillVars`: for each open quest (and each subtask): if `vars === undefined` and a candidate has the same `quest.id`, copy `candidate.quest.vars`; else if `template === 'epic-checkout-master' || 'epic-command-center'` set `{}`; else if `'epic-fortify'` set `{ dir: title.replace(/^Fortify /, '') }`. In `cycle.ts`, call `backfillVars(stillOpen, candidates)` right after `generateCandidates` and before `buildBoard` (the quests are objects of `state.quests`, so the change is saved with the state). `findQuest` gets the optional `lang` (`quest.title.toLowerCase() === ref || (lang && questTitle(quest, lang).toLowerCase() === ref)`); `Engine.quest` passes the current language (`await this.language()`); the error text of "no longer open" in `Engine.accept` stays English.
- [ ] **Step 4: Run to verify** — `npx vitest run tests/game tests/engine tests/i18n` → PASS; tsc; biome.
- [ ] **Step 5: Commit** — `feat(i18n): quest texts by language, backfill of old quests, find by Russian title`.

---

### Task 4: Every screen and notification shows quest texts in the language

**Files:**
- Modify: `src/hud/quests.ts`, `src/hud/report.ts`, `src/hud/present.ts`, `src/hud/notifications.ts`, `src/hud/board-ui.ts`, `src/cli/board.ts`, `src/engine/cycle.ts` (event data), `src/engine/index.ts` (`accept` event), `src/types.ts` (nothing more if event data is a loose record)
- Test: `tests/hud/hud.test.ts`, `tests/hud/board-ui.test.ts`, `tests/engine/language.test.ts`

**Interfaces:**
- Consumes: `questTitle`, `questDescription` (Task 3).
- Produces: every function that prints `quest.title` / `quest.description` / `task.title` prints `questTitle(quest, lang)` / `questDescription(quest, lang)`; events `quest_opened`, `quest_completed`, `epic_progress`, `quest_obsolete`, `verification_failed`, `quest_accepted` carry `template` and `vars` in `data` (and `epicTemplate`/`epicVars` where an epic title is shown), and `notificationLine` renders the title from them when present, else the stored `data.title`.

- [ ] **Step 1: Write the failing tests.** English output unchanged (existing tests). New, Russian: `formatBoard('shop', 1, [q], 'ru')` shows the Russian title; a card shows the Russian description; `formatReport` shows the Russian title of the quest and of its subtasks; `renderList` in Russian shows Russian titles and descriptions and the title column width is computed from the rendered (Russian) titles; `notificationLine(event('quest_completed', { title: 'Clean Up TODOs', template: 'clean-up-todos', vars: {...}, xp: 100 }), 'ru')` → `✓ Уборка TODO: выполнено · +100 XP`; the same event without `template` renders the stored English title; `refreshText` in Russian lists new quests by Russian title; a `board.test.ts` case: with `L` pressed the list shows Russian quest titles.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement.** In `quests.ts` compute `const titles = open.map((q) => questTitle(q, lang))` once and use it for the width and the rows; subtasks and card lines use `questTitle`/`questDescription`; `report.ts` and `present.ts` likewise (`present.questText` passes `view.lang` to `formatQuestCard`, which already receives it). `board-ui.ts`: `naturalWidth`, the row title and `describeLines` use the rendered texts (`lang` is already in the options). `cli/board.ts`: the "taken to work" message uses `questTitle(result.quest, lang)`. `cycle.ts`: a helper `textData(quest)` returning `{ template: quest.template, ...(quest.vars ? { vars: quest.vars } : {}) }` merged into the data of the five events (for `epic_progress` and `quest_obsolete` with an epic, add `epicTemplate`, `epicVars` of the epic and `subtaskTemplate`, `subtaskVars` of the subtask). `notifications.ts`: `titleOf(data, lang)` — if `typeof data.template === 'string'` build a minimal quest-like `{ template, title, description: '', vars }` and call `questTitle`; the epic-progress line uses the epic title and the subtask title the same way. `refreshText`: `titleOf(event.data, lang)`.
- [ ] **Step 4: Run to verify** — `npx vitest run tests/hud tests/cli tests/engine tests/server tests/i18n`; tsc; biome. English tests must all pass unchanged.
- [ ] **Step 5: Commit** — `feat(i18n): boards, cards, reports and notifications show quest texts in the language`.

---

### Task 5: Condition lines in the language

**Files:**
- Modify: `src/hud/quests.ts` (`describeCriterion(criterion, lang?)` and its callers in `quests.ts`, `report.ts`), `src/i18n/en.ts`, `src/i18n/ru.ts` (a `crit.*` block)
- Test: `tests/hud/hud.test.ts`

**Interfaces:**
- Produces: `describeCriterion(criterion: Criterion, lang?: Lang): string` (default `'en'`, English output identical to today).

Keys (`{files}` is the comma-joined list, `{n}` a number, `{list}` the comma-joined commands, `{module}`, `{command}` the capitalised command name):

| key | en | ru |
|---|---|---|
| `crit.resolvedCases` | The finding is gone and the project has at least {n} test cases | Проблема устранена, а в проекте не менее {n} тест-кейсов |
| `crit.resolved` | The findings of this quest are gone | Находки этого квеста устранены |
| `crit.botHandlers` | The bot still has at least {n} handlers | В боте по-прежнему не менее {n} обработчиков |
| `crit.moved` | {files} is at least {n}% smaller and its lines moved into other files | {files} стал меньше не менее чем на {n}%, а его строки перенесены в другие файлы |
| `crit.handlers` | {files} still has the handlers {list} | В {files} по-прежнему есть обработчики {list} |
| `crit.exists` | {files} is still in place and used | {files} на месте и используется |
| `crit.existsTarget` | The target is still in place and used | Цель на месте и используется |
| `crit.testsCover` | Tests import {module} and have at least 3 test cases and 3 assertions | Тесты импортируют {module} и содержат не менее 3 тест-кейсов и 3 проверок |
| `crit.present` | {files} contains the required check | {files} содержит нужную проверку |
| `crit.presentProject` | The project contains the required code | Проект содержит нужный код |
| `crit.secret` | The secret is nowhere in the project | Секрета нигде в проекте нет |
| `crit.deleted` | {files} is deleted | {files} удалён |
| `crit.absent` | The unwanted code is gone | Лишнего кода больше нет |
| `crit.command` | {command} command passes | Команда {command} проходит |
| `crit.noRegressions` | No regressions | Регрессий нет |

(The `{command}` value is `capitalize(params.command)` in both languages: `Test`, `Lint`, `Build`.)

- [ ] **Step 1: Write the failing tests** — for each `Criterion` type/params variant of `describeCriterion` (the seven types, with the sub-variants of `finding_resolved`, `target_exists`, `pattern_present`, `pattern_absent`), assert the English string (identical to the current one) and the Russian string of the table; a card and a report in `ru` show the Russian condition lines.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** the catalog block in both languages and rewrite `describeCriterion` to `t(lang, 'crit.…', vars)`, keeping the branching of the current function; pass `lang` at the two call sites in `formatQuestCard` and the three in `formatReport`.
- [ ] **Step 4: Run to verify** — `npx vitest run tests/hud tests/i18n`; tsc; biome.
- [ ] **Step 5: Commit** — `feat(i18n): condition lines in Russian`.

---

### Task 6: Full check, build, docs, report

**Files:** `ПЛАН.md` (status line), `docs/superpowers/specs/2026-09-30-i18n-design.md` (one line: stage 2 done; the ruling about `vars`).

- [ ] **Step 1:** run `npm run check > .tmp/check.log 2>&1` in the background (3–6 minutes); fix anything red minimally (`npx biome check --write .` first).
- [ ] **Step 2:** `npm run build`; then from Git Bash with `export CODEQUEST_HOME='D:\Claude\codequest-data'` run `node dist/cli/index.js lang ru` then `hud` and `board` (plain text) from `D:\Claude\rpg game-code` and paste the output into the report; the language stays whatever the user had (Russian) at the end. Restart the board panel is the user's step.
- [ ] **Step 3:** update `ПЛАН.md` (one line: stage 2 done, quest texts and condition lines are translated; check reasons and finding messages are stage 3) and the spec (status line of stage 2 and the `vars` ruling).
- [ ] **Step 4:** commit `docs: mark i18n stage 2 done`.
- [ ] **Step 5: Report to the user** (short, plain): what is translated now, what is still English (check reasons such as "Still there: …", finding messages in "Where:", error messages), the real test count, what was not tried (live board), and that existing open quests turn Russian at the next analysis (press R on the board or wait 30 seconds).
