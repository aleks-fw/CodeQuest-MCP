# CodeQuest MCP — спецификация MVP

Дата: 28.09.2026 · Статус: на ревью · Папка: `D:\Claude\rpg game-code`
Основа: ТЗ «Build: CodeQuest MCP» и дизайн из 6 частей, одобренный 28.09. Рабочий план — `ПЛАН.md`.

## 0. Коротко

- CodeQuest — MCP-сервер на TypeScript. У каждого проекта своя RPG-кампания: XP, уровни 1–50, статы, квесты.
- Сканер смотрит проект (JS/TS и Python) и находит проблемы. Из проблем строятся квесты; у магазина и Telegram-бота
  они разные благодаря пакетам под тип проекта.
- Каждый уровень — 500 XP. Награда за квест: Easy 100, Medium 300, Hard 500, Epic 1200, и с каждым уровнем она
  падает на 5%.
- XP — только после проверки: программа сама проверяет условия квеста. Проверка идёт автоматически раз в минуту, пока
  открыт Claude Code, плюс есть кнопка «Проверить квест».
- Доска квестов подстраивается под слабые места: подтянул тесты — наверх выходят архитектура и безопасность.
- Прогресс хранится в `D:\Claude\codequest-data`; в сами проекты ничего не пишется.
- MVP проверяется на трёх тестовых проектах (Next.js-магазин, Node-бот, Python-бот) и двух настоящих открытых
  репозиториях.

## 1. Цель и границы

**Критерии успеха MVP**

1. Магазин и бот получают заметно разные доски квестов; Node- и Python-бот — похожие «ботовые».
2. Улучшение проекта перестраивает доску (адаптация).
3. XP нельзя получить без проверяемого улучшения; размер изменений на XP не влияет.

**Входит в MVP:** сканер (общие правила, JS/TS, Python), статы, хранилище, XP и 50 уровней, генерация квестов
(пакеты «магазин», «Telegram-бот», «общий»), проверка выполнения с автопроверкой и кнопкой, MCP-инструменты, промпты и
ресурсы, текстовый HUD, CLI `codequest`.

**Не входит:** классы, достижения, боссы, история (фаза 2); постоянный HUD с кнопкой «Проверить квест», дашборд, карта
проекта, аналитика (фаза 3); квесты категории Features; квесты, предложенные ИИ; отдельные квесты на ошибки сборки и
линта (в MVP сборка и линт — только условия проверки).

**Принципы**

- Каждый квест связан с реальной проблемой в коде; «игровых» заданий нет.
- Детерминизм: одинаковый проект → одинаковые статы и доска.
- XP начисляет только проверка условий; слова ИИ ничего не значат.
- Игра не важнее разработки: объём кода не награждается, спрятать проблему нельзя.
- Статы — игровые метрики; формулы открыты в `docs/formulas.md`.

## 2. Архитектура

### 2.1 Модули

| Модуль | Отвечает за | Диск и процессы |
|---|---|---|
| `analyzer/` | снимок проекта: факты и находки | читает файлы, вызывает `git` |
| `packs/` | тип проекта, профильные правила и шаблоны квестов | через analyzer |
| `game/` | статы, XP, уровни, доска квестов | нет — чистые функции |
| `verification/` | условия квестов, запуск команд проекта | запускает команды |
| `storage/` | данные прогресса, блокировки | пишет в `CODEQUEST_HOME` |
| `engine/` | сценарии refresh, verify, state | через модули выше |
| `hud/` | текст HUD, доски и отчётов | нет |
| `server/`, `tools/` | MCP: инструменты, промпты, ресурсы, опрос изменений | через engine |
| `cli/` | `codequest mcp / verify / refresh / hud` | через engine |

`game/` и `hud/` не импортируют ничего, что трогает диск или процессы; текущее время им передаётся параметром.
`server/`, `tools/`, `cli/` обращаются только к `engine/`.

### 2.2 Сценарии

**refresh:** определить проект → быстрый ключ изменений (HEAD + отпечаток списка файлов: путь, размер, mtime) → если
ключ совпал с кэшем и нет `force`, снимок берётся из кэша → иначе анализ → статы → автопроверка открытых квестов, чьи
находки исчезли → обновление доски → запись состояния и событий.

**verify(quest?):** refresh → оценка условий квеста (или всех открытых) → команды проекта, если разрешены → квест
выполнен (XP, события), не выполнен (отчёт ✓/✗) или неактуален.

### 2.3 Автопроверка

- MCP-сервер раз в 60 секунд (`CODEQUEST_POLL_SECONDS`, 0 — выключить) считает быстрый ключ текущего проекта; при
  изменении — refresh. Тот же ключ считается перед каждым вызовом инструмента.
- В процессе одновременно идёт одна операция. Если идёт долгая проверка с тестами, инструмент отвечает последним
  состоянием с пометкой «идёт проверка».
- Между процессами (сервер и CLI) — файловая блокировка (раздел 5).

### 2.4 Каталоги

```
rpg game-code/
  package.json, tsconfig.json, vitest.config.ts, biome.json
  src/
    analyzer/      files/ git/ code/ tests/ dependencies/ security/ performance/ stacks/{js,python}/
    packs/         generic/ ecommerce/ telegram-bot/
    game/          stats/ xp/ levels/ quests/
    verification/
    storage/
    engine/
    hud/
    server/        создание MCP-сервера, промпты, ресурсы, опрос изменений
    tools/         по файлу на инструмент
    cli/
  tests/           unit-тесты; fixtures/{nextjs-shop, node-telegram-bot, python-aiogram-bot, rules/}
  docs/            formulas.md; superpowers/specs/; superpowers/plans/
```

Папки фаз 2–3 (bosses, achievements, classes, dashboard) появятся вместе с их кодом.

### 2.5 Зависимости и сборка

- Runtime: `@modelcontextprotocol/sdk`, `zod`, `smol-toml` (разбор `pyproject.toml`).
- Dev: `typescript`, `vitest`, `@types/node`, `@biomejs/biome` (линт и формат).
- Node ≥ 22.12 (требование Vitest 5), ESM, TypeScript `strict`, сборка `tsc` → `dist/`. Git — внешний, вызывается как процесс.
- Установка — только с разрешения, на этапе 1; всё ставится в папку проекта на D.

## 3. Сканер

### 3.1 Файлы

- В git-репозитории — `git ls-files -z --cached --others --exclude-standard`; вне git — обход без `node_modules`,
  `.git`, `dist`, `build`, `.next`, `out`, `coverage`, `__pycache__`, `.venv`, `venv`, `.mypy_cache`, `.pytest_cache`.
- Содержимое читается один раз за запуск и общее для всех правил; файлы больше 1 МБ и бинарные не читаются.
- Пути в снимке — относительные, через `/`.
- Файлы кода: `.ts .tsx .js .jsx .mjs .cjs .py`. HTML и CSS учитываются в языках; по ним работают только правила
  секретов и TODO.
- Тестовые файлы: JS/TS — `*.test.*`, `*.spec.*`, всё в `__tests__/`; Python — `test_*.py`, `*_test.py`, всё в
  `tests/`. Модули — файлы кода, кроме тестов и конфигов (`*.config.*`, `conftest.py`, `setup.py`).

### 3.2 Факты

- `languages` — число файлов по языкам; `stacks` — `js` и/или `python`.
- JS/TS из `package.json`: зависимости, скрипты, фреймворки (next, react, express, fastify, telegraf, grammy,
  node-telegram-bot-api, stripe и др.), тест-раннер (vitest, jest, mocha, node:test), менеджер пакетов по lock-файлу,
  алиас `@/` из `tsconfig`. Проект без `package.json` (статический сайт) разбирается так же, только без зависимостей и
  скриптов.
- Python: `requirements*.txt`, `pyproject.toml` (`[project].dependencies`, `[tool.poetry.dependencies]`,
  `[dependency-groups]`); фреймворки (aiogram, python-telegram-bot, telethon, pyrogram, fastapi, flask, django); pytest
  (в зависимостях, `pytest.ini`, `conftest.py` или `[tool.pytest.ini_options]`); ruff (`[tool.ruff]`, `ruff.toml`);
  интерпретатор проекта — `.venv`/`venv`, иначе `python`.
- Импорт-граф. JS/TS: `import … from`, `export … from`, `import()`, `require()` с относительными путями и алиасом
  `@/`. Python: `import x`, `from x import y`, относительные импорты, пакеты внутри проекта. Внешние пакеты в граф не
  входят.
- Тесты: тест-кейсы (JS — `it(`, `test(`; Python — `def test_`, `async def test_`) без пропущенных; проверки (`expect(`,
  `assert`); связь «тест → модуль» по импортам; покрытие строк из `coverage/coverage-summary.json` или `coverage.xml`,
  если есть.
- Точки входа (для правила «неиспользуемый файл»): `main`/`bin`/`exports` из package.json; маршруты Next.js
  (`app/**/{page,layout,route,loading,error,not-found}.*`, `pages/**`), `middleware.*`; конфиги; файлы из скриптов
  package.json; файлы, подключённые из HTML (`<script src>`); Python-файлы с `if __name__ == "__main__"`, `main.py`,
  `bot.py`, `app.py`, `manage.py`, `__init__.py`; `index.*`, `server.*`, `bot.*` в корне или `src/`.
- Горячие файлы: не меньше 10 коммитов за 90 дней, из них не меньше 3 с `fix|bug|hotfix` в сообщении. Это не находка:
  приоритет квестов в таких файлах ×1.2, а список показывается в состоянии проекта.
- Число обработчиков бота (регистраций команд и сообщений) и число строк кода — для условий проверки.

### 3.3 Правила MVP

Общие (любой язык):

| Правило | Категория | Серьёзность | Что ищет |
|---|---|---|---|
| `generic/todo` | clean-code | low | TODO, FIXME, HACK, XXX в комментариях |
| `generic/large-file` | architecture | medium; high > 800 строк | файл кода длиннее 400 строк |
| `generic/duplicate-block` | clean-code | medium | одинаковый блок из 8+ значимых строк в 2+ местах |
| `generic/hardcoded-secret` | security | critical: живые ключи, токены, приватные ключи; иначе high | `AKIA…`, `sk_live_`/`sk_test_`, токен бота Telegram, `ghp_…`, `-----BEGIN … PRIVATE KEY-----`, `password\|secret\|api_key = "<16+ символов>"` |
| `generic/env-tracked` | security | high | `.env` в git или не в `.gitignore` |
| `generic/no-readme` | maintainability | low | нет README или он короче 10 строк |
| `generic/no-env-example` | maintainability | low | код читает переменные окружения, а `.env.example` нет |
| `generic/no-lockfile` | maintainability | low | есть package.json без lock-файла |
| `generic/suppression` | clean-code | low | `@ts-ignore`, `@ts-nocheck`, `eslint-disable`, `# noqa`, `# type: ignore`, `istanbul ignore`, `pragma: no cover` |
| `generic/skipped-test` | testing | low | `.skip`, `xit`, `xtest`, `@pytest.mark.skip`, `@unittest.skip` |
| `generic/no-tests` | testing | high | модули есть, тестов нет |
| `generic/no-test-command` | testing | medium | тесты есть, команды тестов нет |
| `generic/untested-module` | testing | medium | модуль используется, но ни один тест его не импортирует |
| `generic/import-cycle` | architecture | medium | цикл импортов |
| `generic/unused-file` | clean-code | low | модуль никто не импортирует, и он не точка входа |
| `generic/empty-catch` | reliability | medium | `catch (e) {}`, `except …: pass` |
| `generic/failing-tests` | bug | high | последний прогон тестов упал (только если команды разрешены) |

JS/TS:

| Правило | Категория | Серьёзность | Что ищет |
|---|---|---|---|
| `js/eval` | security | high | `eval(`, `new Function(` |
| `js/dangerous-html` | security | high | `dangerouslySetInnerHTML` без санитайзера в файле |
| `js/sync-fs-in-handler` | performance | medium | синхронные `fs.*Sync(` в API-маршрутах и обработчиках |
| `js/raw-img` | performance | low | `<img>` вместо `next/image` в Next.js |
| `js/debug-log` | clean-code | low | `console.log` в коде (не в тестах и скриптах) |

Python:

| Правило | Категория | Серьёзность | Что ищет |
|---|---|---|---|
| `py/bare-except` | reliability | medium | `except:` |
| `py/mutable-default` | bug | medium | `def f(x=[])`, `={}`, `=set()` |
| `py/blocking-in-async` | performance | high | `time.sleep(`, `requests.` внутри `async def` |
| `py/eval` | security | high | `eval(`, `exec(` |

Пакет «магазин»:

| Правило | Категория | Серьёзность | Что ищет |
|---|---|---|---|
| `shop/webhook-no-signature` | security | critical | маршрут вебхука оплаты без проверки подписи (`stripe.webhooks.constructEvent`, `verifySignature`, HMAC-сравнение) |

Кроме того, пакет повышает до high непротестированные модули оплаты и оформления заказа.

Пакет «Telegram-бот»:

| Правило | Категория | Серьёзность | Что ищет |
|---|---|---|---|
| `bot/no-error-handler` | reliability | high | нет общего обработчика ошибок: `bot.catch(` (telegraf, grammY), `polling_error` (node-telegram-bot-api), `dp.errors`/`router.errors` (aiogram 3), `add_error_handler(` (python-telegram-bot) |
| `bot/admin-no-check` | security | high | команды admin/ban/broadcast/stats и подобные без проверки прав в обработчике или его фильтрах (`ADMIN_IDS`, `is_admin`, сравнение `from.id`/`from_user.id`, фильтр прав) |
| `bot/fat-router` | architecture | medium | в одном файле больше 10 регистраций обработчиков |
| `bot/no-timeout` | reliability | medium | HTTP-вызовы (`fetch`, `axios`, `requests`, `aiohttp`) без таймаута |

Итого 31 правило. Анализ — на уровне шаблонов текста и импортов, без полного разбора кода: возможны ложные
срабатывания и пропуски; каждое правило описано в `docs/formulas.md`, и у каждого есть фикстура «с проблемой» и
«чисто».

Уточнения:

- `untested-module` — модуль, который импортирует хотя бы один другой модуль; не точка входа, не конфиг, не `*.d.ts`,
  не короче 5 строк кода.
- Значимые строки (для дублей) — без пустых строк, комментариев, импортов и строк только из скобок и знаков препинания.
- Если одна строка даёт `generic/empty-catch` и `py/bare-except`, остаётся одна находка — `generic/empty-catch`.
- Правила не учитывают комментарии-подавления (`# noqa`, `eslint-disable` и т. п.): ими проблему не скрыть.

### 3.4 Тип проекта

Пакет выдаёт уверенность от 0 до 1 и список улик; включается при уверенности ≥ 0.5.

- Магазин: платёжная зависимость (`stripe`, `@stripe/*`, `paypal*`, `@shopify/*`, `@medusajs/*`) — 0.5; каждая группа
  путей (cart|basket, checkout|order, product|catalog, payment|webhook) — +0.15; максимум 1.
- Telegram-бот: зависимость бот-фреймворка — 0.8; регистрации обработчиков в коде — +0.2.
- Общий — включён всегда.

### 3.5 Номер находки

`id = sha256(rule + "\n" + путь + "\n" + key)`, первые 16 символов. `key` — смысловой ключ правила без номера строки:
нормализованный текст TODO, хеш нормализованного блока (дубли), хеш значения секрета (само значение не хранится, в
выводе — маска вида `sk_live_…a1b2`), отсортированный список файлов цикла, путь модуля и т. п.

### 3.6 Ошибки и скорость

- Каждое правило выполняется в `try/catch`; исключение пишется в `snapshot.errors`, анализ продолжается.
- Цель: проект на ~1000 файлов кода анализируется меньше чем за 10 секунд.

## 4. Статы

Целые от 0 до 100, округление `Math.round`. Формулы и правила — в `docs/formulas.md`.

- **Architecture, Security, Performance, Clean Code, Reliability, Maintainability:** `100 × e^(−W / (8 × S))`, где
  W — сумма весов открытых находок этой категории (critical 10, high 5, medium 2, low 1), S = 1 + √(файлов кода / 10).
  Нет находок — 100. Пример: 10 файлов и одна high-находка безопасности → Security 73; 250 файлов → 90.
- **Testing:** `60 × c + 20 × cmd + 20 × pass`, где c — доля модулей, на которые есть тесты (или покрытие строк из
  отчёта), cmd — есть команда тестов (0/1), pass — последний прогон зелёный (0/1). Если запуск команд не разрешён,
  `Testing = (60 × c + 20 × cmd) / 80 × 100`. Нет модулей — 100.
- **Bugs:** находки категории bug, кроме `generic/failing-tests`, плюс число упавших тестов последнего прогона (из
  итоговой строки vitest, jest, pytest, `node --test`; если разобрать не удалось — 1).
- **Tech Debt:** число находок правил todo, duplicate-block, unused-file, large-file, suppression.

Категория находки → стат: architecture → Architecture, security → Security, performance → Performance,
clean-code → Clean Code, reliability → Reliability, maintainability → Maintainability, bug → Bugs; testing-находки
порождают квесты, но стат Testing считается по своей формуле. В событиях показываются изменения статов на 1 и больше.

## 5. Хранилище

Папка данных — `CODEQUEST_HOME`; по умолчанию `~/.codequest`, у CLI есть ещё ключ `--home`. У тебя это
`D:\Claude\codequest-data`. MCP-сервер и CLI должны писать в одну папку, поэтому на этапе 10, с твоего «да», переменная
задаётся и в регистрации MCP, и как переменная окружения пользователя Windows (иначе CLI писал бы на диск C).

```
profile.json
projects/<id>/
  project.json     путь, имя, первый коммит, allowCommands, commandTimeoutSec
  snapshot.json    последний снимок (кэш) + ключ изменений
  state.json       XP, уровень, статы, квесты, оплаченные находки, указатель непоказанных событий, последние запуски
  events.jsonl     журнал, только дописывается
  .lock            блокировка
```

- В каждом файле поле `schema: 1`.
- Запись атомарная: во временный файл, затем переименование. Блокировка — файл `.lock` с pid и временем; устаревает
  через 30 секунд; ожидание — до 10 секунд с повтором каждые 50 мс.
- Номер проекта — первые 12 символов sha256 от нормализованного пути корня (на Windows — в нижнем регистре); имя — имя
  папки; первый коммит — `git rev-list --max-parents=0 HEAD`. Если проект открыт по новому пути, старого пути больше
  нет и первый коммит совпадает — используется старый номер, путь обновляется.
- События: `analysis`, `quest_opened`, `quest_completed`, `epic_progress`, `quest_obsolete`, `verification_failed`
  (только при явной проверке), `xp`, `level_up`, `finding_returned`, `settings_changed`. У каждого — порядковый номер и
  время.
- XP в `state.json` — кэш суммы событий `xp`; при расхождении или повреждённом `state.json` файл откладывается как
  `state.broken-<время>.json`, а состояние восстанавливается из журнала и свежего анализа.
- Профиль — список проектов с именем, путём, уровнем, XP и временем обновления. Общего XP нет.

Модель данных (идентификаторы — английские):

```ts
type Severity = 'low' | 'medium' | 'high' | 'critical';
type QuestCategory = 'bug' | 'testing' | 'architecture' | 'security' | 'performance' | 'refactoring'
  | 'cleanup' | 'dependencies' | 'documentation' | 'reliability' | 'maintainability';

interface Finding { id: string; rule: string; category: string; severity: Severity;
  file?: string; line?: number; message: string; key: string }
interface Snapshot { schema: 1; takenAt: string; changeKey: string; head: string | null;
  facts: Facts; findings: Finding[]; errors: { rule: string; message: string }[] }
interface Facts { languages: Record<string, number>; stacks: ('js' | 'python')[]; frameworks: string[];
  domains: { pack: string; confidence: number; evidence: string[] }[];
  commands: { test?: string; lint?: string; build?: string }; sourceFiles: number; modules: number;
  modulesWithTests: number; coverage?: number; testCasesTotal: number; testCasesByModule: Record<string, number>;
  codeLines: number; fileLines: Record<string, number>; botHandlers: number; hotspots: string[] }
interface Quest { id: string; template: string; pack: string; title: string; description: string;
  category: QuestCategory; difficulty: 'easy' | 'medium' | 'hard' | 'epic'; findings: string[];
  criteria: Criterion[]; subtasks?: Quest[]; status: 'open' | 'completed' | 'obsolete';
  createdAt: string; baseline: Baseline; completedAt?: string; xpAwarded?: number;
  lastCheck?: CriterionResult[] }
interface Criterion { type: 'finding_resolved' | 'target_exists' | 'tests_cover' | 'pattern_present'
  | 'pattern_absent' | 'command_passes' | 'no_regressions'; params: Record<string, unknown> }
interface CriterionResult { type: Criterion['type']; ok: boolean; detail: string }
interface Baseline { head: string | null; takenAt: string; findings: string[]; highFindings: string[];
  testCasesTotal: number; testCasesByModule: Record<string, number>; codeLines: number;
  fileLines: Record<string, number>; botHandlers: number; scripts: { test?: string; lint?: string; build?: string } }
interface Stats { architecture: number; testing: number; security: number; performance: number;
  cleanCode: number; reliability: number; maintainability: number; bugs: number; techDebt: number }
interface CommandRun { ok: boolean; exitCode: number | null; failedTests?: number; durationMs: number;
  changeKey: string; at: string; tail: string }
interface ProjectState { schema: 1; xp: number; level: number; stats: Stats; quests: Quest[];
  paidFindings: string[]; shownEventSeq: number; lastRuns: { test?: CommandRun; lint?: CommandRun; build?: CommandRun } }
```

## 6. XP и уровни

- **Награда за квест** = `round(база × 0.95^(уровень − 1) × V)`, минимум 1; уровень — в момент выполнения.
  База: Easy 100, Medium 300, Hard 500, Epic 1200. V = 1.0, если прошёл хотя бы один запуск команды проекта и все
  применимые команды зелёные при неизменённых скриптах; иначе 0.8.
- **Уровень** = `⌊XP / 500⌋ + 1`, максимум 50. После 50-го XP копится, уровень не растёт, в HUD — `MAX`.
- Размер изменений в расчёте не участвует. Каждая находка оплачивается один раз (список оплаченных номеров в состоянии).
  Подзадачи эпика XP не дают, эпик — целиком.

| Уровень | Easy | Medium | Hard | Epic | Medium-квестов до уровня |
|---|---|---|---|---|---|
| 1 | 100 | 300 | 500 | 1200 | — |
| 10 | 63 | 189 | 315 | 756 | ~19 |
| 20 | 38 | 113 | 189 | 453 | ~52 |
| 30 | 23 | 68 | 113 | 271 | ~108 |
| 40 | 14 | 41 | 68 | 162 | ~202 |
| 50 | 8 | 24 | 40 | 97 | ~360 |

Титулы (в HUD — заглавными): 1 Newcomer, 2 Trainee, 3 Coder, 4 Developer, 5 Practitioner, 6 Engineer, 7 Analyst,
8 Bug Hunter, 9 Tester, 10 Builder, 11 Explorer, 12 Code Cleaner, 13 Refactorer, 14 Code Guardian, 15 Systems Master,
16 Architect, 17 Designer, 18 Boss Slayer, 19 Expert, 20 Code Master, 21 Systems Thinker, 22 Chief Architect,
23 Optimizer, 24 Quality Guardian, 25 Veteran, 26 Code Wizard, 27 Systems Researcher, 28 Network Architect,
29 Legacy Slayer, 30 Senior Architect, 31 System Master, 32 Code Warrior, 33 AI Architect, 34 Code Legend,
35 Master Engineer, 36 Empire Architect, 37 Systems Engineer, 38 Code Alchemist, 39 Digital Sage, 40 Grand Architect,
41 Code Titan, 42 System Overlord, 43 Mastermind, 44 Legacy Destroyer, 45 Code Immortal, 46 Digital Master,
47 World Architect, 48 Code Champion, 49 Grandmaster, 50 LEGEND.

## 7. Квесты

### 7.1 Шаблоны

Каждая находка попадает ровно в один квест: если она в профильной части проекта, берётся шаблон пакета, иначе —
общий. Условие со звёздочкой действует, только если команды разрешены и определены.

| Шаблон | Из каких находок | Категория | Условия |
|---|---|---|---|
| Protect Cart (магазин) | untested-module, путь cart/basket | testing | tests_cover, target_exists, command_passes(test)*, no_regressions |
| Payment Guardian (магазин) | untested-module, путь payment/checkout/order | testing | то же |
| Validate Payment Webhooks (магазин) | shop/webhook-no-signature | security | finding_resolved, pattern_present(проверка подписи), target_exists(маршрут), no_regressions |
| Clean Inventory (магазин) | unused-file в components/ с product/item/catalog в пути | cleanup | finding_resolved, pattern_absent(файл удалён), command_passes(build)*, no_regressions |
| Handle API Errors (бот) | bot/no-error-handler | reliability | finding_resolved, pattern_present(регистрация обработчика), no_regressions |
| Guard Admin Commands (бот) | bot/admin-no-check | security | finding_resolved, target_exists(команда на месте), no_regressions |
| Test Message Parsing (бот) | untested-module с parse/extract/format/command в имени | testing | tests_cover, target_exists, command_passes(test)*, no_regressions |
| Improve Command Routing (бот) | bot/fat-router | architecture | finding_resolved, target_exists(обработчиков в проекте не меньше, чем было), no_regressions |
| Add Retry Logic (бот) | bot/no-timeout | reliability | finding_resolved, target_exists, no_regressions |
| Protect the Token (бот) | hardcoded-secret с токеном Telegram | security | finding_resolved, pattern_absent(это значение нигде в проекте), no_regressions |
| Clean Up TODOs | generic/todo | cleanup | finding_resolved, no_regressions |
| Remove Dead Code | generic/unused-file | cleanup | finding_resolved, pattern_absent(файл удалён), command_passes(build)*, no_regressions |
| Split Large File | generic/large-file | architecture | finding_resolved, target_exists(модуль на месте и ≥ 50% убранных строк появились в других файлах), command_passes(build, test)*, no_regressions |
| Break Import Cycle | generic/import-cycle | architecture | finding_resolved, target_exists(все файлы цикла на месте), command_passes(build)*, no_regressions |
| Remove Hardcoded Secret | generic/hardcoded-secret | security | finding_resolved, pattern_absent(это значение нигде в проекте), no_regressions |
| Deduplicate Code | generic/duplicate-block | refactoring | finding_resolved, target_exists(файлы на месте), command_passes(build, test)*, no_regressions |
| Add Test Command | generic/no-test-command | testing | finding_resolved, command_passes(test)* |
| Write First Tests | generic/no-tests | testing | finding_resolved (тестовый файл с ≥ 3 кейсами), command_passes(test)*, no_regressions |
| Add Tests for `<модуль>` | generic/untested-module | testing | tests_cover, target_exists, command_passes(test)*, no_regressions |
| Fix Failing Tests | generic/failing-tests | bug | command_passes(test), no_regressions |
| Write README | generic/no-readme | documentation | finding_resolved |
| Document Environment | generic/no-env-example | documentation | finding_resolved |
| Lock Dependencies | generic/no-lockfile | dependencies | finding_resolved |
| Protect .env | generic/env-tracked | security | finding_resolved, no_regressions |
| Remove Suppressions | generic/suppression | cleanup | finding_resolved, command_passes(lint)*, no_regressions |
| Revive Skipped Tests | generic/skipped-test | testing | finding_resolved, command_passes(test)*, no_regressions |
| Handle Errors in `<файл>` | generic/empty-catch, py/bare-except | reliability | finding_resolved, no_regressions |
| Sanitize HTML | js/dangerous-html | security | finding_resolved, target_exists, no_regressions |
| Remove eval | js/eval, py/eval | security | finding_resolved, target_exists, no_regressions |
| Async File Access | js/sync-fs-in-handler | performance | finding_resolved, target_exists, no_regressions |
| Optimize Images | js/raw-img | performance | finding_resolved, no_regressions |
| Remove Debug Logs | js/debug-log | cleanup | finding_resolved, command_passes(lint)*, no_regressions |
| Fix Mutable Defaults | py/mutable-default | bug | finding_resolved, no_regressions |
| Unblock the Event Loop | py/blocking-in-async | performance | finding_resolved, target_exists, no_regressions |

Эпики: Checkout Master (магазин: корзина, оформление, оплата), Command Center (бот: квесты пакета «бот»), Fortify
`<папка>` (общий: одна папка верхнего уровня).

### 7.2 Пачки

Находки одного правила с серьёзностью low или medium в одной папке объединяются в один квест, не больше 10 находок на
квест. Правила секретов, вебхуков, циклов и `untested-module` в пачки не объединяются: у каждой такой находки свой квест.

### 7.3 Сложность

- По наибольшей серьёзности: low → Easy, medium → Medium, high и critical → Hard.
- Security и architecture — не ниже Medium.
- Квест на 3+ файла с серьёзностью от medium — Hard.
- Epic — только собранный эпик (7.4).

### 7.4 Эпики

Если среди кандидатов 3 или больше квестов одной области, а открытого эпика нет, собирается эпик из 3 квестов этой
области с наибольшим приоритетом; остальные квесты области остаются обычными. Области: у магазина — пути
cart|basket, checkout|order, payment|webhook (вместе — Checkout Master); у бота — квесты пакета «бот»; у общего — папка
верхнего уровня (только квесты сложности Medium и выше). Подзадачи показываются под эпиком, а не отдельными строками
доски. Выполненная подзадача отмечается событием `epic_progress` без XP; эпик выполнен, когда выполнены все три.

### 7.5 Приоритет

`приоритет = вес × слабость × профильность × горячесть`:

- вес — critical 10, high 5, medium 2, low 1; у пачки — сумма, не больше 10;
- слабость = 0.1 + (100 − стат) / 100 по стату категории квеста (bug → всегда 1.1; testing → Testing; architecture →
  Architecture; security → Security; performance → Performance; refactoring и cleanup → Clean Code; reliability →
  Reliability; documentation, dependencies, maintainability → Maintainability);
- профильность — 1.5 для шаблона пакета, иначе 1;
- горячесть — 1.2, если квест касается горячего файла;
- у эпика — сумма приоритетов подзадач; при равенстве — по номеру квеста.

### 7.6 Адаптация

Если стат категории 80 и выше, новые Easy и Medium квесты этой категории не выдаются; Hard и Epic — выдаются. Квесты на
баги выдаются всегда. Уже открытые квесты не снимаются.

### 7.7 Доска

- До 8 открытых квестов, не больше 3 из одной категории и не больше 1 эпика (эпик занимает одно место).
- Открытые квесты не перемешиваются: остаются, пока не выполнены или не стали неактуальны. Свободные места
  заполняются кандидатами по приоритету.
- Номер квеста — первые 12 символов sha256 от шаблона и отсортированных номеров находок. Для людей — короткий номер
  (первые 5 символов); квест можно указать коротким номером, уникальным префиксом или названием.
- Порядок на доске — по сложности (Easy → Epic), внутри — по приоритету.

Пример для тестового магазина (уровень 1):

```
QUEST BOARD · shop · LVL 1 NEWCOMER
🟢 Clean Inventory            Easy   · Cleanup      +100 XP
🟢 Clean Up TODOs             Easy   · Cleanup      +100 XP
🟢 Optimize Images            Easy   · Performance  +100 XP
🔴 Checkout Master            Epic   · 3 tasks      +1200 XP
   ├─ Protect Cart
   ├─ Payment Guardian
   └─ Validate Payment Webhooks
```

Карточка квеста:

```
QUEST Protect Cart · a1b2c · Medium · Testing · +300 XP
Add tests for the cart logic in lib/cart.ts.
□ Tests import lib/cart.ts and have at least 3 test cases
□ lib/cart.ts is still in place and used
□ Test command passes
□ No regressions
```

## 8. Проверка выполнения

### 8.1 Условия

- `finding_resolved` — находок квеста нет в свежем снимке.
- `target_exists` — модуль квеста существует и используется (импортируется или является точкой входа); у отдельных
  шаблонов — дополнительные проверки из таблицы 7.1.
- `tests_cover` — тестовые файлы, импортирующие модуль, содержат не меньше 3 непропущенных тест-кейсов и не меньше
  3 проверок.
- `pattern_present(файлы, шаблон)` / `pattern_absent(файлы, шаблон)` — шаблон найден / не найден; `pattern_absent`
  без шаблона — файл удалён; «значение нигде в проекте» — ни одной находки правила секретов с тем же ключом.
- `command_passes(test|lint|build)` — команда завершилась с кодом 0 в пределах таймаута.
- `no_regressions` — в файлах, изменённых после появления квеста (`git diff` от HEAD «как было», плюс незакоммиченные
  и новые файлы; вне git — по времени изменения), нет новых high/critical находок; тест-кейсов в проекте не меньше, чем
  было; если тесты запускались — они зелёные.

### 8.2 «Как было»

При появлении квеста запоминаются поля `Baseline` (раздел 5): HEAD, номера находок квеста, все high/critical находки,
число тест-кейсов (всего и по модулям), число строк кода (всего и по файлам квеста), число обработчиков бота, тексты
скриптов test/lint/build.

### 8.3 Когда запускается

- **Автоматически:** при изменении проекта (опрос раз в минуту и перед каждым вызовом) — для открытых квестов, у
  которых исчезли все находки. Команды запускаются не больше одного раза на ключ изменений; результат общий для всех
  проверяемых квестов.
- **Кнопка «Проверить квест»:** инструмент `verify_quest_completion`, промпт `verify_quest`, `codequest verify` —
  проверяет указанный квест или все открытые, даже если находки ещё на месте, и показывает подробный отчёт.
- **Итог:** все условия выполнены → квест выполнен, XP, события. Находки исчезли, но модуль или файл квеста пропал
  (`target_exists` или `pattern_present` не выполняются из-за отсутствия файла) → квест неактуален, без XP, причина в
  журнале. Иначе квест остаётся открытым; при явной проверке — событие `verification_failed` и отчёт ✓/✗, при
  автопроверке — только последний результат в состоянии, без уведомлений.

### 8.4 Команды проекта

- JS/TS: `test`, если в скриптах есть `test` и это не заглушка npm; `lint` и `build` — если есть такие скрипты. Запуск
  через менеджер пакетов проекта: `npm test` / `npm run lint`, `pnpm …`, `yarn …`.
- Python: `test` = `<интерпретатор> -m pytest -q`, если есть pytest; `lint` = `<интерпретатор> -m ruff check .`, если
  настроен ruff; сборки нет. Если модуль не установлен (`No module named …`), команда считается недоступной и
  пропускается.
- Какие команды нужны: `test` — квестам с условием `command_passes(test)` и всем для `no_regressions`; `build` —
  architecture, refactoring, cleanup; `lint` — Remove Suppressions и Remove Debug Logs.
- Запуск: папка проекта, переменные `CI=1`, `FORCE_COLOR=0`; на Windows — через оболочку (для `npm.cmd`); по таймауту
  (по умолчанию 300 с, настройка 30–1800 с) — завершение всего дерева процессов (`taskkill /T /F`). В журнал — код
  выхода, время и последние 50 строк вывода.
- Запуск включается только `set_project_settings(allow_commands: true)` после согласия пользователя. Произвольную
  команду передать нельзя.

### 8.5 Защита от накрутки

- «Готово» без выполненных условий — 0 XP.
- Правила CodeQuest не учитывают комментарии-подавления, поэтому ими проблему не скрыть; сами подавления — находки
  `generic/suppression`.
- Удалённые или пропущенные тесты — регрессия; удалённый модуль — квест неактуален.
- Если скрипт test/lint/build изменился после появления квеста, его запуск не подтверждает (V = 0.8), событие
  помечается.
- Уже оплаченная находка XP больше не даёт; её возврат — событие `finding_returned`.
- Известное ограничение: удаление TODO без реальной работы не отличить; поэтому это Easy-квест пачкой на папку.

## 9. Интерфейсы

### 9.1 Проект

Необязательный `project_path` → первый root от клиента MCP → текущая папка сервера; от неё — вверх до корня git (или
сама папка вне git). Сервер запоминает последний использованный проект; его и опрашивает.

### 9.2 Инструменты MCP

Ответ — короткий текст на английском (с HUD и непоказанными событиями вверху) + структурированные данные.

| Инструмент | Параметры | Что возвращает |
|---|---|---|
| `get_project_state` | `project_path?` | уровень, титул, XP, статы, топ квестов, типы проекта, горячие файлы, HUD |
| `get_project_stats` | `project_path?` | статы и главные находки, которые их снижают |
| `get_player_level` | `project_path?` | уровень, XP до следующего, множитель награды, все проекты профиля |
| `get_active_quests` | `project_path?` | доска квестов |
| `get_quest_details` | `quest_id`, `project_path?` | карточка квеста, условия с последним результатом, файлы и строки |
| `verify_quest_completion` | `quest_id?`, `project_path?` | отчёт ✓/✗, XP, level up, изменения статов |
| `refresh_project_analysis` | `project_path?` | пересчёт без кэша; что изменилось |
| `set_project_settings` | `project_path?`, `allow_commands?`, `command_timeout_sec?` | какие команды будут запускаться |

`set_project_settings` в описании требует явного согласия пользователя в разговоре.

### 9.3 Промпты (меню `/` в Claude Code)

- `verify_quest(quest?)` — кнопка «Проверить квест»: проверить и показать отчёт.
- `quest_board()` — HUD, доска и совет, за какой квест взяться.
- `work_on_quest(quest)` — прочитать квест, сделать его и запустить проверку.

### 9.4 Ресурсы

`codequest://hud` (текст), `codequest://quests` (текст доски), `codequest://state` (JSON) — для текущего проекта.

### 9.5 CLI

`codequest mcp` — запустить MCP-сервер (stdio); `codequest refresh [--force] [--path P]`;
`codequest verify [квест] [--path P]`; `codequest hud [--minimal] [--path P]`; у всех — `--home H`. Код выхода 0 —
успех, 1 — ошибка.

### 9.6 HUD и уведомления

```
⚔️ LVL 7 · ANALYST · 3,240 XP                  ← Minimal

⚔️ LVL 7 · ANALYST                              ← HUD
███████░░░░░░░ 48% (240/500)
🧠 61 🧪 83 🛡️ 91
⚡ 78 🧹 69 🐛 3
```

Полоска — 14 символов. Уведомления — только значимые: выполненный квест, прогресс эпика, level up, изменения статов,
возврат проблемы; не больше 5 строк, дальше «+N more».

```
✓ Protect Cart complete · +300 XP · Testing 42 → 51
⚔️ LEVEL UP 2 → 3 · CODER
```

### 9.7 Ошибки

Нет пути или это не папка → понятное сообщение без падения сервера; упавшее правило → «run errors» в ответе; занятая
блокировка дольше 10 секунд → сообщение «попробуйте ещё раз»; повреждённое состояние → восстановление (раздел 5).

### 9.8 Регистрация

Этап 10, только с твоего «да»: user scope, команда `node "D:\Claude\rpg game-code\dist\cli\index.js" mcp`, переменная
`CODEQUEST_HOME=D:\Claude\codequest-data` в регистрации и в переменных окружения пользователя (для CLI).

## 10. Тестирование

- **Unit:** формулы статов, уровни, XP, приоритет, адаптация, лимиты доски, эпики, условия — таблицами входов и
  ожидаемых результатов; одинаковый вход → одинаковый результат.
- **Правила:** `tests/fixtures/rules/<правило>/{bad,good}` — в «bad» находка есть, в «good» нет.
- **Проекты-фикстуры:**
  - `nextjs-shop` (next, react, stripe): `lib/cart.ts` и `lib/payment.ts` без тестов, вебхук Stripe без
    `constructEvent`, неиспользуемый `components/ProductBadge.tsx`, TODO, `<img>`; ожидаются эпик Checkout Master
    (Protect Cart, Payment Guardian, Validate Payment Webhooks) и Clean Inventory;
  - `node-telegram-bot` (telegraf): все команды в одном файле, нет `bot.catch`, `/ban` без проверки прав,
    `src/parse.ts` без тестов, `fetch` без таймаута; ожидаются Handle API Errors, Guard Admin Commands, Test Message
    Parsing, Improve Command Routing, Add Retry Logic — три из них внутри эпика Command Center;
  - `python-aiogram-bot` (aiogram 3): то же на Python плюс `requests.get` внутри `async def`; ожидаются те же ботовые
    квесты и Unblock the Event Loop.
- Тесты копируют фикстуру во временную папку с пробелом и кириллицей в имени, делают `git init` и коммит.
- JS-фикстуры тестируются через `node --test` (без зависимостей). Для Python-фикстуры запуск pytest проверяется, только
  если pytest установлен; иначе тест помечается пропущенным, и это видно в отчёте.
- **Сценарии:**
  - адаптация: в копию добавлены тесты → Testing ≥ 80 → Easy и Medium квесты тестирования не выдаются, наверх выходят
    архитектура и безопасность;
  - полный цикл: в копии магазина удалён неиспользуемый компонент (Clean Inventory, +100 XP) и выполнены три подзадачи
    Checkout Master (+1200 XP) → автопроверка → 1300 XP → уровень 1 → 3;
  - защита от накрутки: «готово» без изменений → 0 XP; удалён `lib/cart.ts` → Protect Cart неактуален; добавлен
    `@ts-ignore` → новая находка; удалены тесты → регрессия; изменён скрипт тестов → V = 0.8.
- **MCP:** все инструменты, промпты и ресурсы через клиент в том же процессе (`InMemoryTransport` из SDK); автопроверка
  по таймеру с коротким интервалом.

## 11. Приёмка MVP

1. Прогон на трёх фикстурах и двух открытых репозиториях (магазин на Next.js и бот на Node; клоны на D, в репозиторий
   не попадают). С твоего разрешения и только на чтение — `D:\Claude\тг бот`.
2. Доски магазина и ботов заметно разные; у Node- и Python-бота — похожие ботовые квесты.
3. Сценарий адаптации и полный цикл «квест → фикс → автопроверка → XP → уровень» проходят.
4. Кнопка «Проверить квест» показывает отчёт ✓/✗.
5. Отчёт приёмки с досками рядом и честным списком того, что не работает.
6. После регистрации — живой вызов из новой сессии Claude Code.

## 12. Этапы реализации

1. Каркас: TypeScript, Vitest, Biome, структура `src/`, MCP-сервер с одним инструментом.
2. Сканер: файлы, факты, импорт-граф, общие правила и правила JS/TS.
3. Сканер: Python.
4. Статы и `docs/formulas.md`.
5. Хранилище: файлы, блокировка, журнал, восстановление, профиль.
6. XP и уровни.
7. Квесты: пакеты, шаблоны, пачки, сложность, эпики, приоритет, адаптация, доска.
8. Проверка: условия, «как было», команды, регрессии, защита от накрутки.
9. Engine, MCP (инструменты, промпты, ресурсы), HUD, автопроверка, CLI.
10. Приёмка и, с твоего «да», регистрация.

После каждого этапа: `tsc --noEmit`, `biome check`, `vitest run`, локальный коммит и отчёт с реальным выводом и тем, что
не проверено.

## 13. Открытые вопросы

- Какие два открытых репозитория взять для приёмки — предложу на этапе 10.
- Где постоянно показывать HUD — решим в фазе 3.
