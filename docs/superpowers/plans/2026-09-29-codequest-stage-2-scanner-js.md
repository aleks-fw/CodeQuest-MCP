# CodeQuest этап 2 — сканер: файлы, факты, импорт-граф, общие правила и правила JS/TS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Библиотека `src/analyzer/`, которая по папке проекта строит `Snapshot` (спек §5): факты проекта и находки
21 правила (16 общих + 5 JS/TS).

**Architecture:** `listFiles` → `loadFiles` (один раз читает содержимое) → сборка контекста: факты JS-проекта,
импорт-граф, точки входа, факты тестов, метрики, git-история → правила (`Rule.run(ctx)` — чистые функции над
контекстом) → `Finding` со стабильным `id`. Вход — `analyzeProject(root, { now })`. MCP и engine в этом этапе не
меняются (подключение — этап 9).

**Tech Stack:** как в этапе 1 (Node 24, TypeScript 7.0.2, Vitest 5.0.2, Biome 2.5.14), внешний `git`. Новых
зависимостей нет.

**Spec:** `docs/superpowers/specs/2026-09-28-codequest-design.md` — §3.1–3.3, §3.5, §3.6, §10 (правила и фикстуры).
Сквозные договорённости: `docs/superpowers/plans/2026-09-29-codequest-roadmap.md`.

## Global Constraints

- Никаких новых npm-пакетов. Git — внешний процесс через `runGit` (не бросает исключений).
- Пути в снимке — относительные, через `/` (спек §3.1). Файлы > 1 МБ и бинарные не читаются.
- В git: `git ls-files -z --cached --others --exclude-standard`; вне git — обход без `node_modules`, `.git`, `dist`,
  `build`, `.next`, `out`, `coverage`, `__pycache__`, `.venv`, `venv`, `.mypy_cache`, `.pytest_cache`.
- Файлы кода: `.ts .tsx .js .jsx .mjs .cjs .py`. Тесты: JS/TS `*.test.*`, `*.spec.*`, всё в `__tests__/`; Python
  `test_*.py`, `*_test.py`, всё в `tests/`. Конфиги: `*.config.*`, `conftest.py`, `setup.py`.
- `Finding.id = sha256(rule + "\n" + путь + "\n" + key)`, первые 16 hex-символов; `key` без номера строки (спек §3.5).
- Каждое правило выполняется в `try/catch`; исключение → `snapshot.errors`, анализ продолжается (спек §3.6).
- Одинаковый проект → одинаковый снимок (кроме `takenAt`): все списки отсортированы.
- Анализ ~1000 файлов кода — меньше 10 секунд.
- Правила не учитывают комментарии-подавления (`eslint-disable`, `# noqa` и т. п.).
- У каждого правила — фикстура `tests/fixtures/rules/<scope>.<name>/{bad,good}`: в bad находка есть, в good нет.
- Фикстуры не содержат настоящих dot-файлов и строк, похожих на секреты: `_gitignore` → `.gitignore`, `_env…` →
  `.env…`, `__FAKE_<ИМЯ>__` → фальшивый секрет подставляются при копировании (Task 6).
- Временные папки тестов — в `<repo>/.tmp/`, путь с пробелом и кириллицей (`makeTempDir`).
- Слои: `analyzer/` не импортирует `engine/`, `server/`, `tools/`, `cli/`, `hud/`, `game/`.
- Коммиты — с `-m` флагами; последняя строка `Co-Authored-By: <модель, которая писала> <noreply@anthropic.com>`.

## Решения по неясностям спека

- «`untested-module` — модуль, который импортирует хотя бы один другой модуль» читаю как в таблице правил: модуль
  **используется** — его импортирует хотя бы один не тестовый файл проекта.
- `generic/failing-tests` требует запуска команд — переносится в этап 8. Python-импорт-граф, Python-факты и
  `py/*` — этап 3; до этого `untested-module`, `unused-file`, `import-cycle` работают только для JS/TS
  (`GRAPH_LANGUAGES`).
- `duplicate-block` не смотрит тестовые файлы (дубли в тестах — норма).
- Ключ находок «по строке» — нормализованный текст строки; повтор того же ключа в том же файле получает суффикс
  `#2`, `#3` (так номер не зависит от номера строки).
- Секреты в файлах `.env*` и lock-файлах не ищутся: за `.env` отвечает `generic/env-tracked`.
- Ключ секрета начинается с его типа (`telegram:`, `stripe:` …) — этап 7 по нему выберет шаблон «Protect the Token».

## Review Focus

1. Имена файлов с кириллицей в git-репозитории — `git ls-files -z` без кавычек и `\ooo`-экранирования (Task 1).
2. Файлы с CRLF — номера строк и регулярные выражения не ломаются из-за `\r` (Task 1, Task 7).
3. Файл > 1 МБ или бинарный — пропускается без падения (Task 1).
4. Битый `package.json` или `tsconfig.json` с комментариями — анализ не падает, факты пустые/частичные (Task 2).
5. Пустой git-репозиторий без коммитов — `head: null`, анализ работает (Task 6).

---

## Структура файлов после этапа

```
src/analyzer/
  git.ts              runGit, classifyGitFailure
  map-limit.ts        mapLimit — ограничение параллельности
  files.ts            listFiles, loadFiles, toSourceFile, languageOf, kindOf, isTestPath
  jsonc.ts            parseJsonc
  js-project.ts       readJsProject: package.json, фреймворки, команды, менеджер пакетов, алиас @/
  import-graph.ts     buildImportGraph, extractJsSpecifiers, resolveJsSpecifier, GRAPH_LANGUAGES
  entry-points.ts     findEntryPoints
  test-facts.ts       collectTestFacts, countTestCases, countAssertions, readCoverage
  metrics.ts          measureLines, countBotHandlers
  history.ts          readHead, readHotspots, computeChangeKey
  context.ts          AnalysisContext, isModule
  findings.ts         findingId, toFindings, lineKey
  analyze.ts          analyzeProject
  rules/
    types.ts          Rule, RuleHit, FindingCategory
    text.ts           помощники: matchLines, isCommentLine
    index.ts          RULES
    todo.ts suppression.ts skipped-test.ts empty-catch.ts large-file.ts js-eval.ts js-debug-log.ts
    no-readme.ts no-env-example.ts no-lockfile.ts env-tracked.ts hardcoded-secret.ts
    no-tests.ts no-test-command.ts untested-module.ts import-cycle.ts unused-file.ts
    duplicate-block.ts js-dangerous-html.ts js-sync-fs-in-handler.ts js-raw-img.ts
src/engine/project.ts  (изменён: git-ошибки кроме «не репозиторий»/«нет git» → понятная ошибка)
tests/analyzer/*.test.ts
tests/helpers/source-files.ts  sourceFiles() — SourceFile из строк для unit-тестов
tests/helpers/fixtures.ts      copyFixture()
tests/fixtures/rules/<scope>.<name>/{bad,good}/…
tests/fixtures/projects/{nextjs-shop,node-telegram-bot}/…
```

---

### Task 1: Git-помощник, список и чтение файлов

**Files:**
- Create: `src/analyzer/git.ts`, `src/analyzer/map-limit.ts`, `src/analyzer/files.ts`, `tests/analyzer/git.test.ts`,
  `tests/analyzer/files.test.ts`
- Modify: `src/engine/project.ts` (функция `gitRoot`), `tsconfig.json`, `vitest.config.ts`, `biome.json`

**Interfaces:**
- Consumes: `CodeQuestError`; тестовые помощники `makeGitProject`, `makeTempDir`, `cleanupTempDirs`.
- Produces:
  - `interface GitResult { ok: boolean; stdout: string; stderr: string; code: number | null }`;
    `runGit(cwd: string, args: string[]): Promise<GitResult>` — никогда не бросает;
    `type GitFailure = 'not-repo' | 'no-git' | 'no-commits' | 'other'`; `classifyGitFailure(result: GitResult): GitFailure`;
  - `mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]>`;
  - `type Language = 'typescript' | 'javascript' | 'python' | 'html' | 'css' | 'other'`;
    `type FileKind = 'code' | 'test' | 'config' | 'other'`;
    `interface ListedFile { path: string; size: number; mtimeMs: number }`;
    `interface SourceFile extends ListedFile { language: Language; kind: FileKind; content: string | null; lines: string[] }`;
    `interface FileListing { files: ListedFile[]; tracked: Set<string>; isGitRepo: boolean }`;
    `listFiles(root: string): Promise<FileListing>`; `loadFiles(root: string, listed: ListedFile[]): Promise<SourceFile[]>`;
    `toSourceFile(file: ListedFile, content: string | null): SourceFile`; `languageOf(p)`, `kindOf(p)`, `isTestPath(p)`,
    `isCodePath(p)`; константы `MAX_READ_BYTES`, `SKIP_DIRS`.

- [ ] **Step 1: Исключить фикстуры из проверки типов, линта и сборщика тестов**

Фикстуры намеренно содержат плохой код (`eval`, пустой `catch`, `*.test.ts`), поэтому их не проверяют ни `tsc`, ни
Biome, ни Vitest.

`tsconfig.json` — добавить после `"include"`:

```json
  "exclude": ["tests/fixtures"]
```

`vitest.config.ts` — в объект `test` добавить:

```ts
    exclude: ['**/node_modules/**', 'tests/fixtures/**'],
```

`biome.json` — добавить ключ верхнего уровня:

```json
  "files": { "includes": ["**", "!!**/tests/fixtures"] }
```

`!!` — «force-ignore» Biome 2.x: папка не проверяется и не индексируется (документация Biome, `files.includes`).
Проверка: после Task 6 (первая фикстура) `npm run lint` не показывает файлы из `tests/fixtures`.

- [ ] **Step 2: Написать падающие тесты**

`tests/analyzer/git.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { classifyGitFailure, runGit } from '../../src/analyzer/git.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

describe('classifyGitFailure', () => {
  it.each([
    [128, 'fatal: not a git repository (or any of the parent directories): .git', 'not-repo'],
    [null, 'spawn git ENOENT', 'no-git'],
    [128, "fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.", 'no-commits'],
    [128, "fatal: detected dubious ownership in repository at 'D:/x'", 'other'],
  ] as const)('code %s, "%s" → %s', (code, stderr, expected) => {
    expect(classifyGitFailure({ ok: false, stdout: '', stderr, code })).toBe(expected);
  });
});

describe('runGit', () => {
  it('reports failure without throwing outside a repository', async () => {
    const dir = await makeTempDir();
    const result = await runGit(dir, ['rev-parse', '--show-toplevel']);
    expect(result.ok).toBe(false);
    expect(classifyGitFailure(result)).toBe('not-repo');
  });
});
```

`tests/analyzer/files.test.ts`:

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { kindOf, languageOf, listFiles, loadFiles, MAX_READ_BYTES, toSourceFile } from '../../src/analyzer/files.js';
import { cleanupTempDirs, makeGitProject, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

async function put(root: string, relative: string, content: string | Buffer): Promise<void> {
  const full = path.join(root, relative);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

describe('listFiles', () => {
  it('lists tracked and untracked files but not ignored ones, with / separators', async () => {
    const root = await makeGitProject({
      'src/модуль.ts': 'export const a = 1;\n',
      '.gitignore': 'secret.txt\n',
      'README.md': '# x\n',
    });
    await put(root, 'src/new.ts', 'export {};\n');
    await put(root, 'secret.txt', 'hidden');
    const listing = await listFiles(root);
    const paths = listing.files.map((file) => file.path);
    expect(listing.isGitRepo).toBe(true);
    expect(paths).toEqual(['.gitignore', 'README.md', 'src/new.ts', 'src/модуль.ts']);
    expect(listing.tracked.has('src/модуль.ts')).toBe(true);
    expect(listing.tracked.has('src/new.ts')).toBe(false);
    expect(listing.files[0]?.size).toBeGreaterThan(0);
  });

  it('walks folders outside git and skips build and dependency folders', async () => {
    const root = await makeTempDir();
    await put(root, 'a.js', 'x');
    await put(root, 'node_modules/x/index.js', 'x');
    await put(root, 'dist/b.js', 'x');
    await put(root, 'sub/c.py', 'x');
    const listing = await listFiles(root);
    expect(listing.isGitRepo).toBe(false);
    expect(listing.files.map((file) => file.path)).toEqual(['a.js', 'sub/c.py']);
    expect(listing.tracked.size).toBe(0);
  });
});

describe('loadFiles', () => {
  it('skips big and binary files and splits CRLF lines', async () => {
    const root = await makeTempDir();
    await put(root, 'big.ts', 'x'.repeat(MAX_READ_BYTES + 1));
    await put(root, 'image.ts', Buffer.from([1, 2, 0, 3]));
    await put(root, 'crlf.ts', '\uFEFFa\r\nb\r\n');
    const files = await loadFiles(root, (await listFiles(root)).files);
    const byPath = new Map(files.map((file) => [file.path, file]));
    expect(byPath.get('big.ts')?.content).toBeNull();
    expect(byPath.get('image.ts')?.content).toBeNull();
    expect(byPath.get('crlf.ts')?.content).toBe('a\r\nb\r\n');
    expect(byPath.get('crlf.ts')?.lines).toEqual(['a', 'b']);
  });
});

describe('classification', () => {
  it.each([
    ['src/a.ts', 'code', 'typescript'],
    ['src/a.test.ts', 'test', 'typescript'],
    ['src/__tests__/a.js', 'test', 'javascript'],
    ['vitest.config.ts', 'config', 'typescript'],
    ['types.d.ts', 'code', 'typescript'],
    ['tests/test_bot.py', 'test', 'python'],
    ['bot/handlers_test.py', 'test', 'python'],
    ['tests/helpers.py', 'test', 'python'],
    ['tests/conftest.py', 'config', 'python'],
    ['setup.py', 'config', 'python'],
    ['index.html', 'other', 'html'],
    ['styles.css', 'other', 'css'],
    ['README.md', 'other', 'other'],
  ] as const)('%s → %s / %s', (filePath, kind, language) => {
    expect(kindOf(filePath)).toBe(kind);
    expect(languageOf(filePath)).toBe(language);
  });

  it('builds a SourceFile from text without a trailing empty line', () => {
    const file = toSourceFile({ path: 'a.py', size: 4, mtimeMs: 0 }, 'x\ny\n');
    expect(file).toMatchObject({ language: 'python', kind: 'code', lines: ['x', 'y'] });
  });
});
```

- [ ] **Step 3: Убедиться, что тесты падают**

Run: `npx vitest run tests/analyzer`
Expected: FAIL — не найдены модули `src/analyzer/git.js` и `src/analyzer/files.js`.

- [ ] **Step 4: Реализовать**

`src/analyzer/git.ts`:

```ts
import { execFile } from 'node:child_process';

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** Exit code; null when git could not be started. */
  code: number | null;
}

export type GitFailure = 'not-repo' | 'no-git' | 'no-commits' | 'other';

/** Runs git in cwd and never throws: failures come back as ok=false (spec §3.1). */
export function runGit(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, windowsHide: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ ok: true, stdout, stderr, code: 0 });
          return;
        }
        const code = typeof error.code === 'number' ? error.code : null;
        resolve({ ok: false, stdout: stdout ?? '', stderr: stderr || error.message, code });
      },
    );
  });
}

export function classifyGitFailure(result: GitResult): GitFailure {
  const text = result.stderr.toLowerCase();
  if (result.code === null && /enoent|not found|not recognized/.test(text)) return 'no-git';
  if (text.includes('not a git repository')) return 'not-repo';
  if (/does not have any commits|unknown revision|bad revision 'head'/.test(text)) return 'no-commits';
  return 'other';
}
```

`src/analyzer/map-limit.ts`:

```ts
/** Like Promise.all over items, but runs at most `limit` calls at once (keeps file handles bounded). */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
```

`src/analyzer/files.ts`:

```ts
import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { runGit } from './git.js';
import { mapLimit } from './map-limit.js';

export type Language = 'typescript' | 'javascript' | 'python' | 'html' | 'css' | 'other';
export type FileKind = 'code' | 'test' | 'config' | 'other';

export interface ListedFile {
  /** Relative to the project root, with / separators. */
  path: string;
  size: number;
  mtimeMs: number;
}

export interface SourceFile extends ListedFile {
  language: Language;
  kind: FileKind;
  /** null for files over MAX_READ_BYTES and binary files. */
  content: string | null;
  /** content split on \r?\n, without a trailing empty line. */
  lines: string[];
}

export interface FileListing {
  files: ListedFile[];
  /** Files in the git index; empty outside git. */
  tracked: Set<string>;
  isGitRepo: boolean;
}

export const MAX_READ_BYTES = 1024 * 1024;
const IO_LIMIT = 64;

export const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  '.mypy_cache',
  '.pytest_cache',
]);

const LANGUAGE_BY_EXT: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
};

const CODE_EXTS: ReadonlySet<string> = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py']);

export function languageOf(filePath: string): Language {
  return LANGUAGE_BY_EXT[path.posix.extname(filePath).toLowerCase()] ?? 'other';
}

export function isCodePath(filePath: string): boolean {
  return CODE_EXTS.has(path.posix.extname(filePath).toLowerCase());
}

export function isTestPath(filePath: string): boolean {
  const base = path.posix.basename(filePath);
  const folders = filePath.split('/').slice(0, -1);
  if (filePath.endsWith('.py')) {
    return /^test_.*\.py$/.test(base) || base.endsWith('_test.py') || folders.includes('tests');
  }
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(base) || folders.includes('__tests__');
}

export function kindOf(filePath: string): FileKind {
  if (!isCodePath(filePath)) return 'other';
  const base = path.posix.basename(filePath);
  if (base === 'conftest.py' || base === 'setup.py') return 'config';
  if (isTestPath(filePath)) return 'test';
  if (/\.config\.[cm]?[jt]s$/.test(base)) return 'config';
  return 'code';
}

/** Project files: git ls-files (tracked + untracked, not ignored) in a repo, a filtered walk outside git. */
export async function listFiles(root: string): Promise<FileListing> {
  const all = await runGit(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  if (all.ok) {
    const cached = await runGit(root, ['ls-files', '-z', '--cached']);
    const tracked = new Set(splitNul(cached.stdout));
    return { files: await statAll(root, [...new Set(splitNul(all.stdout))]), tracked, isGitRepo: true };
  }
  return { files: await statAll(root, await walk(root, '')), tracked: new Set(), isGitRepo: false };
}

export async function loadFiles(root: string, listed: ListedFile[]): Promise<SourceFile[]> {
  return mapLimit(listed, IO_LIMIT, async (file) =>
    toSourceFile(file, await readText(path.join(root, file.path), file.size)),
  );
}

export function toSourceFile(file: ListedFile, content: string | null): SourceFile {
  const lines = content === null ? [] : content.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return { ...file, language: languageOf(file.path), kind: kindOf(file.path), content, lines };
}

async function readText(fullPath: string, size: number): Promise<string | null> {
  if (size > MAX_READ_BYTES) return null;
  const buffer = await readFile(fullPath).catch(() => null);
  if (!buffer || buffer.subarray(0, 8000).includes(0)) return null;
  const text = buffer.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function splitNul(text: string): string[] {
  return text.split('\0').filter((part) => part.length > 0);
}

async function statAll(root: string, relativePaths: string[]): Promise<ListedFile[]> {
  const stats = await mapLimit(relativePaths, IO_LIMIT, async (relative) => {
    const info = await stat(path.join(root, relative)).catch(() => null);
    return info?.isFile() ? { path: relative.replaceAll('\\', '/'), size: info.size, mtimeMs: info.mtimeMs } : null;
  });
  return stats
    .filter((file): file is ListedFile => file !== null)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

async function walk(root: string, folder: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(path.join(root, folder), { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    const relative = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...(await walk(root, relative)));
    } else if (entry.isFile()) {
      found.push(relative);
    }
  }
  return found;
}
```

Порядок путей — по кодовым точкам (`<`), не `localeCompare`: так результат не зависит от локали.

`src/engine/project.ts` — заменить функцию `gitRoot` и импорты `execFile`/`promisify`/`run`:

```ts
import { classifyGitFailure, runGit } from '../analyzer/git.js';

async function gitRoot(dir: string): Promise<string | null> {
  const result = await runGit(dir, ['rev-parse', '--show-toplevel']);
  if (result.ok) {
    const top = result.stdout.trim();
    return top ? path.resolve(top) : null;
  }
  const failure = classifyGitFailure(result);
  // Not a repository, or git is missing: the folder itself is the project.
  if (failure === 'not-repo' || failure === 'no-git') return null;
  // Anything else (e.g. "dubious ownership") would silently pick the wrong root, so say it.
  throw new CodeQuestError(`git failed in ${dir}: ${result.stderr.trim().split('\n')[0] ?? ''}`);
}
```

Удалить из `project.ts` ставшие ненужными `import { execFile } from 'node:child_process'`,
`import { promisify } from 'node:util'` и `const run = promisify(execFile);`.

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `npx vitest run tests/analyzer tests/engine`
Expected: PASS — `git.test.ts` 5, `files.test.ts` 17, `project.test.ts` 9.

- [ ] **Step 6: Commit**

```powershell
npm run format
npm run check
git add tsconfig.json vitest.config.ts biome.json src tests
git commit -m "feat(analyzer): git helper, file listing and loading" -m "Co-Authored-By: <model> <noreply@anthropic.com>"
```

Expected от `npm run check`: без ошибок, 21 + 22 = `43 passed`.

### Task 2: JSONC, факты JS-проекта, помощник `sourceFiles`

**Files:**
- Create: `src/analyzer/jsonc.ts`, `src/analyzer/js-project.ts`, `tests/helpers/source-files.ts`,
  `tests/analyzer/jsonc.test.ts`, `tests/analyzer/js-project.test.ts`

**Interfaces:**
- Consumes: `SourceFile`, `toSourceFile` (Task 1).
- Produces:
  - `parseJsonc(text: string): unknown` — бросает, как `JSON.parse`, на невалидном тексте;
  - `type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'`; `type TestRunner = 'vitest' | 'jest' | 'mocha' | 'node:test'`;
  - `interface JsProject { hasPackageJson: boolean; dependencies: string[]; scripts: Record<string, string>;
    packageManager: PackageManager; frameworks: string[]; testRunner: TestRunner | null;
    commands: { test?: string; lint?: string; build?: string }; entryRefs: string[]; aliasBase: string | null }`;
  - `readJsProject(files: Map<string, SourceFile>): JsProject` — никогда не бросает;
  - тестовые помощники: `sourceFiles(files: Record<string, string>): SourceFile[]` (отсортированы по пути, `size` =
    длина строки, `mtimeMs` 0) и `byPath(files: SourceFile[]): Map<string, SourceFile>`.

- [ ] **Step 1: Написать падающие тесты и помощник**

`tests/helpers/source-files.ts`:

```ts
import { type SourceFile, toSourceFile } from '../../src/analyzer/files.js';

/** In-memory SourceFiles for unit tests of pure analyzers; sorted by path like listFiles. */
export function sourceFiles(files: Record<string, string>): SourceFile[] {
  return Object.keys(files)
    .sort()
    .map((filePath) => {
      const content = files[filePath] ?? '';
      return toSourceFile({ path: filePath, size: content.length, mtimeMs: 0 }, content);
    });
}

export function byPath(files: SourceFile[]): Map<string, SourceFile> {
  return new Map<string, SourceFile>(files.map((file) => [file.path, file]));
}
```

`tests/analyzer/jsonc.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseJsonc } from '../../src/analyzer/jsonc.js';

describe('parseJsonc', () => {
  it('drops line and block comments but keeps comment-like text inside strings', () => {
    const text = '{ // note\n "a": "http://x/*y*/", /* block */ "b": 1 }';
    expect(parseJsonc(text)).toEqual({ a: 'http://x/*y*/', b: 1 });
  });

  it('honours escaped quotes inside strings', () => {
    expect(parseJsonc('{"a": "say \\"hi\\" // not a comment"}')).toEqual({ a: 'say "hi" // not a comment' });
  });

  it('removes trailing commas in objects and arrays', () => {
    expect(parseJsonc('{"a": [1, 2,], "b": {"c": 3,},}')).toEqual({ a: [1, 2], b: { c: 3 } });
  });

  it('throws on invalid JSON', () => {
    expect(() => parseJsonc('{ a: 1 }')).toThrow();
  });
});
```

`tests/analyzer/js-project.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { type JsProject, readJsProject } from '../../src/analyzer/js-project.js';
import { byPath, sourceFiles } from '../helpers/source-files.js';

function project(files: Record<string, string>): JsProject {
  return readJsProject(byPath(sourceFiles(files)));
}

function pkg(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

describe('readJsProject: package.json', () => {
  it('reads dependencies, frameworks, scripts, commands and the test runner', () => {
    const scripts = { dev: 'next dev', build: 'next build', lint: 'biome check .', test: 'vitest run' };
    const js = project({
      'package.json': pkg({
        name: 'shop',
        dependencies: { next: '15.0.0', react: '19.0.0', stripe: '17.0.0', '@stripe/stripe-js': '5.0.0', zod: '4.0.0' },
        devDependencies: { vitest: '5.0.2', typescript: '7.0.2' },
        scripts,
      }),
      'package-lock.json': '{}',
    });
    expect(js).toEqual({
      hasPackageJson: true,
      dependencies: ['@stripe/stripe-js', 'next', 'react', 'stripe', 'typescript', 'vitest', 'zod'],
      scripts,
      packageManager: 'npm',
      frameworks: ['next', 'react', 'stripe'],
      testRunner: 'vitest',
      commands: { test: 'npm test', lint: 'npm run lint', build: 'npm run build' },
      entryRefs: [],
      aliasBase: null,
    });
  });

  it.each([
    ['pnpm-lock.yaml', 'pnpm', 'pnpm test'],
    ['yarn.lock', 'yarn', 'yarn test'],
    ['bun.lockb', 'bun', 'bun run test'],
    ['bun.lock', 'bun', 'bun run test'],
  ] as const)('%s → %s', (lock, manager, testCommand) => {
    const js = project({ 'package.json': pkg({ scripts: { test: 'vitest run', build: 'tsc' } }), [lock]: '' });
    expect(js.packageManager).toBe(manager);
    expect(js.commands).toEqual({ test: testCommand, build: `${manager} run build` });
  });

  it('ignores the npm init test stub', () => {
    const js = project({
      'package.json': pkg({
        devDependencies: { mocha: '11.0.0' },
        scripts: { test: 'echo "Error: no test specified" && exit 1' },
      }),
    });
    expect(js.commands).toEqual({});
    expect(js.testRunner).toBe('mocha');
  });

  it('detects node:test from the test script', () => {
    const js = project({ 'package.json': pkg({ scripts: { test: 'node --test tests/' } }) });
    expect(js.testRunner).toBe('node:test');
    expect(js.commands).toEqual({ test: 'npm test' });
  });

  it('maps bot and server packages to framework ids', () => {
    const js = project({
      'package.json': pkg({
        dependencies: {
          telegraf: '4.0.0',
          express: '5.0.0',
          '@nestjs/core': '11.0.0',
          'node-telegram-bot-api': '0.66.0',
          grammy: '1.0.0',
        },
        devDependencies: { jest: '30.0.0' },
      }),
    });
    expect(js.frameworks).toEqual(['express', 'grammy', 'nestjs', 'node-telegram-bot-api', 'telegraf']);
    expect(js.testRunner).toBe('jest');
    expect(js.commands).toEqual({});
  });

  it('survives a broken package.json', () => {
    const js = project({ 'package.json': '{ "name": "x", ', 'yarn.lock': '' });
    expect(js).toEqual({
      hasPackageJson: false,
      dependencies: [],
      scripts: {},
      packageManager: 'yarn',
      frameworks: [],
      testRunner: null,
      commands: {},
      entryRefs: [],
      aliasBase: null,
    });
  });

  it('treats a missing or non-object package.json as absent', () => {
    const missing = project({ 'README.md': '# x\n' });
    expect(missing.hasPackageJson).toBe(false);
    expect(missing.packageManager).toBe('npm');
    expect(project({ 'package.json': '[]' }).hasPackageJson).toBe(false);
  });

  it('collects entry refs from main, bin and exports', () => {
    const js = project({
      'package.json': pkg({
        main: './dist/index.js',
        bin: { cq: './bin/cli.js', other: 'bin/other.js' },
        exports: {
          '.': { import: './src/index.ts', require: './dist/index.cjs' },
          './package.json': './package.json',
        },
      }),
    });
    expect(js.entryRefs).toEqual([
      'bin/cli.js',
      'bin/other.js',
      'dist/index.cjs',
      'dist/index.js',
      'package.json',
      'src/index.ts',
    ]);
    expect(project({ 'package.json': pkg({ bin: './cli.js' }) }).entryRefs).toEqual(['cli.js']);
  });
});

describe('readJsProject: @/ alias', () => {
  it('reads a tsconfig.json with comments and trailing commas', () => {
    const tsconfig = [
      '{',
      '  // editor settings',
      '  "compilerOptions": {',
      '    /* aliases */ "baseUrl": ".",',
      '    "paths": { "@/*": ["./src/*"], },',
      '  },',
      '}',
    ].join('\n');
    expect(project({ 'tsconfig.json': tsconfig }).aliasBase).toBe('src/');
  });

  it('joins the target with baseUrl', () => {
    const tsconfig = pkg({ compilerOptions: { baseUrl: 'src', paths: { '@/*': ['*'] } } });
    expect(project({ 'tsconfig.json': tsconfig }).aliasBase).toBe('src/');
  });

  it('falls back to jsconfig.json and supports a root alias', () => {
    const jsconfig = pkg({ compilerOptions: { paths: { '@/*': ['./*'] } } });
    expect(project({ 'jsconfig.json': jsconfig }).aliasBase).toBe('');
  });

  it('is null without an @/* path or with a broken tsconfig.json', () => {
    expect(project({ 'tsconfig.json': pkg({ compilerOptions: { strict: true } }) }).aliasBase).toBeNull();
    const jsconfig = pkg({ compilerOptions: { paths: { '@/*': ['./src/*'] } } });
    expect(project({ 'tsconfig.json': '{ "compilerOptions": ', 'jsconfig.json': jsconfig }).aliasBase).toBeNull();
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run tests/analyzer/jsonc.test.ts tests/analyzer/js-project.test.ts`
Expected: FAIL — не найдены модули `src/analyzer/jsonc.js` и `src/analyzer/js-project.js`.

- [ ] **Step 3: Реализовать**

`src/analyzer/jsonc.ts`:

```ts
/** Parses JSON with comments and trailing commas (tsconfig.json flavour). Throws like JSON.parse. */
export function parseJsonc(text: string): unknown {
  return JSON.parse(stripComments(text).replace(/,(\s*[}\]])/g, '$1'));
}

/** Drops line and block comments outside strings, so "http://x" or "./src/*" inside a string survives. */
function stripComments(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (inString) {
      if (ch === '\\') {
        out += ch + text.charAt(i + 1);
        i++;
        continue;
      }
      if (ch === '"') inString = false;
      out += ch;
      continue;
    }
    const next = text.charAt(i + 1);
    if (ch === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      if (end === -1) break;
      // The loop's i++ lands on '\n', which is kept so JSON.parse errors keep their line numbers.
      i = end - 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 1;
      out += ' ';
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}
```

`src/analyzer/js-project.ts`:

```ts
import path from 'node:path';
import type { SourceFile } from './files.js';
import { parseJsonc } from './jsonc.js';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
export type TestRunner = 'vitest' | 'jest' | 'mocha' | 'node:test';

export interface JsProject {
  /** True only when the root package.json parsed to an object. */
  hasPackageJson: boolean;
  /** Sorted union of dependencies and devDependencies. */
  dependencies: string[];
  scripts: Record<string, string>;
  packageManager: PackageManager;
  /** Sorted framework ids (values of FRAMEWORKS). */
  frameworks: string[];
  testRunner: TestRunner | null;
  commands: { test?: string; lint?: string; build?: string };
  /** Sorted targets of main, bin and exports, without a leading './'. */
  entryRefs: string[];
  /** '@/x' resolves to aliasBase + 'x' ('src/' or ''); null when there is no '@/*' path. */
  aliasBase: string | null;
}

type JsonObject = Record<string, unknown>;

// A Map, not an object literal: a dependency named "constructor" must not hit Object.prototype.
const FRAMEWORKS: ReadonlyMap<string, string> = new Map<string, string>([
  ['next', 'next'],
  ['react', 'react'],
  ['vue', 'vue'],
  ['svelte', 'svelte'],
  ['express', 'express'],
  ['fastify', 'fastify'],
  ['koa', 'koa'],
  ['@nestjs/core', 'nestjs'],
  ['telegraf', 'telegraf'],
  ['grammy', 'grammy'],
  ['node-telegram-bot-api', 'node-telegram-bot-api'],
  ['stripe', 'stripe'],
  ['@stripe/stripe-js', 'stripe'],
]);

const RUNNER_DEPENDENCIES = ['vitest', 'jest', 'mocha'] as const;

/** Facts from the root package.json, lock files and tsconfig/jsconfig; broken files give empty facts. */
export function readJsProject(files: Map<string, SourceFile>): JsProject {
  const pkg = parseObject(files.get('package.json')?.content);
  const dependencies = sortedUnique([
    ...Object.keys(asObject(pkg?.dependencies)),
    ...Object.keys(asObject(pkg?.devDependencies)),
  ]);
  const scripts = stringEntries(pkg?.scripts);
  const packageManager = detectManager(files);
  return {
    hasPackageJson: pkg !== null,
    dependencies,
    scripts,
    packageManager,
    frameworks: sortedUnique(dependencies.flatMap((dependency) => FRAMEWORKS.get(dependency) ?? [])),
    testRunner: detectTestRunner(dependencies, scripts),
    commands: detectCommands(scripts, packageManager),
    entryRefs: pkg === null ? [] : collectEntryRefs(pkg),
    aliasBase: readAliasBase(files),
  };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function parseObject(text: string | null | undefined): JsonObject | null {
  if (text === null || text === undefined) return null;
  try {
    const value = parseJsonc(text);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function stringEntries(value: unknown): Record<string, string> {
  const entries = Object.entries(asObject(value)).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  // fromEntries defines own properties, so a "__proto__" script cannot change the prototype.
  return Object.fromEntries(entries);
}

function detectManager(files: Map<string, SourceFile>): PackageManager {
  if (files.has('pnpm-lock.yaml')) return 'pnpm';
  if (files.has('yarn.lock')) return 'yarn';
  if (files.has('bun.lockb') || files.has('bun.lock')) return 'bun';
  return 'npm';
}

function detectTestRunner(dependencies: string[], scripts: Record<string, string>): TestRunner | null {
  for (const runner of RUNNER_DEPENDENCIES) {
    if (dependencies.includes(runner)) return runner;
  }
  return scripts.test?.includes('node --test') ? 'node:test' : null;
}

function detectCommands(scripts: Record<string, string>, manager: PackageManager): JsProject['commands'] {
  const commands: JsProject['commands'] = {};
  const test = scripts.test;
  // `npm init` writes a test script that only fails; it is not a real test command.
  if (test !== undefined && !/no test specified/.test(test)) {
    commands.test = manager === 'bun' ? 'bun run test' : `${manager} test`;
  }
  if (scripts.lint !== undefined) commands.lint = `${manager} run lint`;
  if (scripts.build !== undefined) commands.build = `${manager} run build`;
  return commands;
}

function collectEntryRefs(pkg: JsonObject): string[] {
  const refs: string[] = [];
  if (typeof pkg.main === 'string') refs.push(pkg.main);
  if (typeof pkg.bin === 'string') {
    refs.push(pkg.bin);
  } else {
    for (const value of Object.values(asObject(pkg.bin))) {
      if (typeof value === 'string') refs.push(value);
    }
  }
  collectStrings(pkg.exports, refs);
  return sortedUnique(refs.map((ref) => ref.replace(/^(?:\.\/)+/, '')));
}

/** Every string leaf of an exports map (conditions and subpaths nest arbitrarily). */
function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (isObject(value)) {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
}

function readAliasBase(files: Map<string, SourceFile>): string | null {
  // A broken tsconfig.json still wins over jsconfig.json: the TypeScript tooling would not read jsconfig either.
  const config = files.get('tsconfig.json') ?? files.get('jsconfig.json');
  const options = parseObject(config?.content)?.compilerOptions;
  if (!isObject(options) || !isObject(options.paths)) return null;
  const targets = options.paths['@/*'];
  const first: unknown = Array.isArray(targets) ? targets[0] : undefined;
  if (typeof first !== 'string') return null;
  const baseUrl = typeof options.baseUrl === 'string' ? options.baseUrl : '.';
  let base = path.posix.normalize(path.posix.join(baseUrl, first));
  if (base.endsWith('*')) base = base.slice(0, -1);
  base = base.replace(/^(?:\.\/)+/, '');
  if (base === '' || base === '.') return '';
  return base.endsWith('/') ? base : `${base}/`;
}
```

`package.json` читается через `parseJsonc` — это надмножество JSON, отдельный путь не нужен. `sort()` без
компаратора сравнивает кодовые единицы UTF-16, как `<` в Task 1, и не зависит от локали.

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run tests/analyzer/jsonc.test.ts tests/analyzer/js-project.test.ts`
Expected: PASS — `jsonc.test.ts` 4, `js-project.test.ts` 15 (19 passed).

- [ ] **Step 5: Commit**

```powershell
npm run format
npm run check
git add src/analyzer/jsonc.ts src/analyzer/js-project.ts tests/helpers/source-files.ts tests/analyzer/jsonc.test.ts tests/analyzer/js-project.test.ts
git commit -m "feat(analyzer): jsonc parser and JS project facts" -m "Co-Authored-By: <model> <noreply@anthropic.com>"
```

Expected от `npm run check`: без ошибок, все тесты зелёные.

---

### Task 3: Импорт-граф и точки входа

**Files:**
- Create: `src/analyzer/import-graph.ts`, `src/analyzer/entry-points.ts`, `tests/analyzer/import-graph.test.ts`,
  `tests/analyzer/entry-points.test.ts`

**Interfaces:**
- Consumes: `SourceFile`, `Language`, `isCodePath`, `toSourceFile` (Task 1); `JsProject`, `readJsProject` (Task 2);
  тестовые помощники `sourceFiles`, `byPath`.
- Produces:
  - `const GRAPH_LANGUAGES: ReadonlySet<Language>` = `typescript`, `javascript` (этап 3 добавит `python`);
  - `interface ImportGraph { imports: Map<string, string[]>; importedBy: Map<string, string[]> }` — у каждого файла
    графа запись в обеих картах (возможно `[]`), списки отсортированы и без повторов, только файлы проекта;
  - `extractJsSpecifiers(content: string): string[]` — отсортированные уникальные спецификаторы;
  - `resolveJsSpecifier(from: string, specifier: string, files: ReadonlySet<string>, aliasBase: string | null): string | null`;
  - `buildImportGraph(files: SourceFile[], aliasBase: string | null): ImportGraph`;
  - `findEntryPoints(files: SourceFile[], js: JsProject): Set<string>` — пути в отсортированном порядке вставки.

- [ ] **Step 1: Написать падающие тесты**

`tests/analyzer/import-graph.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toSourceFile } from '../../src/analyzer/files.js';
import {
  buildImportGraph,
  extractJsSpecifiers,
  GRAPH_LANGUAGES,
  resolveJsSpecifier,
} from '../../src/analyzer/import-graph.js';
import { sourceFiles } from '../helpers/source-files.js';

describe('extractJsSpecifiers', () => {
  it('finds static, multi-line, type, re-export, side-effect, dynamic and require specifiers', () => {
    const content = [
      "import a from './a';",
      'import { b,',
      "  c } from '../b.js';",
      "import type { T } from '@/types';",
      "export * from './re';",
      'export { x } from "./x";',
      "import './side.css';",
      "const lazy = await import('./lazy');",
      "const fs = require('node:fs');",
      "const text = 'no import here';",
    ].join('\n');
    expect(extractJsSpecifiers(content)).toEqual([
      '../b.js',
      './a',
      './lazy',
      './re',
      './side.css',
      './x',
      '@/types',
      'node:fs',
    ]);
  });
});

describe('resolveJsSpecifier', () => {
  const FILES: ReadonlySet<string> = new Set([
    'src/a.ts',
    'src/b.tsx',
    'src/c.ts',
    'src/util/index.ts',
    'src/lib/math.js',
    'lib/cart.ts',
  ]);

  it.each([
    ['src/main.ts', './a', 'src/a.ts'],
    ['src/main.ts', './a.js', 'src/a.ts'],
    ['src/main.ts', './b', 'src/b.tsx'],
    ['src/main.ts', './util', 'src/util/index.ts'],
    ['src/main.ts', './lib/math.js', 'src/lib/math.js'],
    ['src/util/index.ts', '../c', 'src/c.ts'],
    ['src/main.ts', '@/c', 'src/c.ts'],
    ['src/main.ts', 'react', null],
    ['src/main.ts', './missing', null],
    ['src/main.ts', '../../outside', null],
  ] as const)('%s imports %s → %s', (from, specifier, expected) => {
    expect(resolveJsSpecifier(from, specifier, FILES, 'src/')).toBe(expected);
  });

  it('resolves @/ only with an alias base', () => {
    expect(resolveJsSpecifier('src/main.ts', '@/c', FILES, null)).toBeNull();
    expect(resolveJsSpecifier('app/page.tsx', '@/lib/cart', FILES, '')).toBe('lib/cart.ts');
  });
});

describe('buildImportGraph', () => {
  it('links project files both ways and ignores packages and non-graph files', () => {
    const files = sourceFiles({
      'src/a.ts': "import { b } from './b';\nimport { c } from './c.js';\nimport React from 'react';\n",
      'src/b.ts': "export { c } from './c';\n",
      'src/c.ts': 'export const c = 1;\n',
      'src/a.test.ts': "import { a } from './a';\n",
      'vitest.config.ts': "import { defineConfig } from 'vitest/config';\n",
      'scripts/tool.py': 'import os\n',
      'README.md': "import x from './src/a';\n",
    });
    const graph = buildImportGraph(files, null);
    const nodes = ['src/a.test.ts', 'src/a.ts', 'src/b.ts', 'src/c.ts', 'vitest.config.ts'];
    expect([...graph.imports.keys()]).toEqual(nodes);
    expect([...graph.importedBy.keys()]).toEqual([...graph.imports.keys()]);
    expect(graph.imports.get('src/a.ts')).toEqual(['src/b.ts', 'src/c.ts']);
    expect(graph.imports.get('src/c.ts')).toEqual([]);
    expect(graph.importedBy.get('src/c.ts')).toEqual(['src/a.ts', 'src/b.ts']);
    expect(graph.importedBy.get('src/a.ts')).toEqual(['src/a.test.ts']);
    expect(graph.importedBy.get('vitest.config.ts')).toEqual([]);
  });

  it('skips unread files and languages outside GRAPH_LANGUAGES', () => {
    const files = [
      ...sourceFiles({ 'src/a.ts': "import './big';\n" }),
      toSourceFile({ path: 'src/big.ts', size: 2_000_000, mtimeMs: 0 }, null),
    ];
    const graph = buildImportGraph(files, null);
    expect(graph.imports.has('src/big.ts')).toBe(false);
    expect(graph.imports.get('src/a.ts')).toEqual([]);
    expect([...GRAPH_LANGUAGES]).toEqual(['typescript', 'javascript']);
  });
});
```

`tests/analyzer/entry-points.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { findEntryPoints } from '../../src/analyzer/entry-points.js';
import { readJsProject } from '../../src/analyzer/js-project.js';
import { byPath, sourceFiles } from '../helpers/source-files.js';

function entries(files: Record<string, string>): string[] {
  const list = sourceFiles(files);
  return [...findEntryPoints(list, readJsProject(byPath(list)))];
}

describe('findEntryPoints', () => {
  it('takes package.json main, bin, exports and file paths from scripts', () => {
    const pkg = {
      main: './dist/index.js',
      bin: { tool: 'bin/tool.js' },
      exports: { '.': './src/lib.ts' },
      scripts: { start: 'node "./scripts/start.js"', dev: 'tsx watch tools/dev.ts --clear' },
    };
    expect(
      entries({
        'package.json': JSON.stringify(pkg),
        'bin/tool.js': '',
        'src/lib.ts': '',
        'scripts/start.js': '',
        'tools/dev.ts': '',
        'src/other.ts': '',
      }),
    ).toEqual(['bin/tool.js', 'scripts/start.js', 'src/lib.ts', 'tools/dev.ts']);
  });

  it('knows Next.js routing files', () => {
    expect(
      entries({
        'app/page.tsx': '',
        'app/shop/[id]/page.tsx': '',
        'app/components/Card.tsx': '',
        'src/app/api/pay/route.ts': '',
        'pages/index.tsx': '',
        'middleware.ts': '',
        'lib/cart.ts': '',
      }),
    ).toEqual([
      'app/page.tsx',
      'app/shop/[id]/page.tsx',
      'middleware.ts',
      'pages/index.tsx',
      'src/app/api/pay/route.ts',
    ]);
  });

  it('counts config files and root index/server/bot files', () => {
    expect(
      entries({
        'vite.config.ts': '',
        'src/index.ts': '',
        'server.js': '',
        'src/bot.ts': '',
        'src/util.ts': '',
        'lib/index.ts': '',
      }),
    ).toEqual(['server.js', 'src/bot.ts', 'src/index.ts', 'vite.config.ts']);
  });

  it('follows local <script src> in HTML and skips remote ones', () => {
    expect(
      entries({
        'public/index.html': [
          '<script src="https://cdn.example/x.js"></script>',
          '<script type="module" src="./js/app.js?v=2"></script>',
          '<script src="//cdn.example/y.js"></script>',
          '<img data-src="img.js">',
        ].join('\n'),
        'public/js/app.js': '',
        'index.html': '<script src="/main.js"></script>\n',
        'main.js': '',
        'img.js': '',
      }),
    ).toEqual(['main.js', 'public/js/app.js']);
  });

  it('knows Python main guards and conventional file names', () => {
    expect(
      entries({
        'tools/run.py': "def main():\n    pass\n\nif __name__ == '__main__':\n    main()\n",
        'pkg/__init__.py': '',
        'pkg/helpers.py': 'def f():\n    pass\n',
        'app.py': '',
      }),
    ).toEqual(['app.py', 'pkg/__init__.py', 'tools/run.py']);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run tests/analyzer/import-graph.test.ts tests/analyzer/entry-points.test.ts`
Expected: FAIL — не найдены модули `src/analyzer/import-graph.js` и `src/analyzer/entry-points.js`.

- [ ] **Step 3: Реализовать**

`src/analyzer/import-graph.ts`:

```ts
import path from 'node:path';
import type { FileKind, Language, SourceFile } from './files.js';

/** Languages whose imports are resolved; stage 3 adds python. */
export const GRAPH_LANGUAGES: ReadonlySet<Language> = new Set<Language>(['typescript', 'javascript']);

export interface ImportGraph {
  /** file → files it imports directly. Every graph file has an entry; lists are sorted and unique. */
  imports: Map<string, string[]>;
  /** file → files that import it directly. Same keys as imports. */
  importedBy: Map<string, string[]>;
}

const GRAPH_KINDS: ReadonlySet<FileKind> = new Set<FileKind>(['code', 'test', 'config']);

// Regexes instead of a parser: fast on 1000 files, and a missed edge only weakens a hint, never crashes.
const FROM_SPECIFIER = /\b(?:import|export)\s[^'"]*?\sfrom\s*['"]([^'"]+)['"]/g;
const SIDE_EFFECT_SPECIFIER = /\bimport\s*['"]([^'"]+)['"]/g;
const CALL_SPECIFIER = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const RESOLVE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
// TypeScript ESM code imports './x.js' while the file on disk is x.ts.
const TS_FOR_JS_EXTS = ['.ts', '.tsx', '.mts', '.cts'];

export function extractJsSpecifiers(content: string): string[] {
  const found = new Set<string>();
  for (const pattern of [FROM_SPECIFIER, SIDE_EFFECT_SPECIFIER, CALL_SPECIFIER]) {
    for (const match of content.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) found.add(specifier);
    }
  }
  return [...found].sort();
}

/** Project file the specifier points to; null for packages, unknown aliases and missing files. */
export function resolveJsSpecifier(
  from: string,
  specifier: string,
  files: ReadonlySet<string>,
  aliasBase: string | null,
): string | null {
  let base: string;
  if (specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../')) {
    base = path.posix.join(path.posix.dirname(from), specifier);
  } else if (specifier.startsWith('@/') && aliasBase !== null) {
    base = path.posix.normalize(aliasBase + specifier.slice(2));
  } else {
    return null;
  }
  base = base.replace(/\/+$/, '');
  for (const candidate of candidatesFor(base)) {
    if (files.has(candidate)) return candidate;
  }
  return null;
}

function candidatesFor(base: string): string[] {
  const stem = base.replace(/\.[cm]?js$/, '');
  const fromJs = stem === base ? [] : TS_FOR_JS_EXTS.map((ext) => stem + ext);
  const indexBase = base === '.' ? 'index' : `${base}/index`;
  return [base, ...fromJs, ...RESOLVE_EXTS.map((ext) => base + ext), ...RESOLVE_EXTS.map((ext) => indexBase + ext)];
}

export function buildImportGraph(files: SourceFile[], aliasBase: string | null): ImportGraph {
  const nodes = new Map<string, string>();
  for (const file of files) {
    if (GRAPH_LANGUAGES.has(file.language) && GRAPH_KINDS.has(file.kind) && file.content !== null) {
      nodes.set(file.path, file.content);
    }
  }
  const paths = [...nodes.keys()].sort();
  const known: ReadonlySet<string> = new Set(paths);
  const imports = new Map<string, string[]>();
  const importedBy = new Map<string, string[]>(paths.map((filePath) => [filePath, []]));
  // Walking sources in sorted order keeps every importedBy list sorted without a second pass.
  for (const from of paths) {
    const targets = new Set<string>();
    for (const specifier of extractJsSpecifiers(nodes.get(from) ?? '')) {
      const target = resolveJsSpecifier(from, specifier, known, aliasBase);
      if (target !== null) targets.add(target);
    }
    const sorted = [...targets].sort();
    imports.set(from, sorted);
    for (const target of sorted) importedBy.get(target)?.push(from);
  }
  return { imports, importedBy };
}
```

`src/analyzer/entry-points.ts`:

```ts
import path from 'node:path';
import { isCodePath, type SourceFile } from './files.js';
import type { JsProject } from './js-project.js';

const NEXT_ENTRY_PATTERNS: readonly RegExp[] = [
  /^(src\/)?app\/(.*\/)?(page|layout|route|loading|error|not-found|template|default)\.[cm]?[jt]sx?$/,
  /^(src\/)?pages\//,
  /^(src\/)?middleware\.[cm]?[jt]s$/,
];
const ROOT_ENTRY = /^(src\/)?(index|server|bot)\.(py|[cm]?[jt]sx?)$/;
const PY_MAIN_GUARD = /if\s+__name__\s*==\s*['"]__main__['"]/;
const PY_ENTRY_NAMES: ReadonlySet<string> = new Set(['main.py', 'bot.py', 'app.py', 'manage.py', '__init__.py']);
// \s before src so data-src="…" does not count.
const SCRIPT_SRC = /<script\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/gi;
const EXTERNAL_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** Files that run without being imported (spec §3.2): unused-file and untested-module skip them. */
export function findEntryPoints(files: SourceFile[], js: JsProject): Set<string> {
  const paths = new Set(files.map((file) => file.path));
  const found = new Set<string>();
  const addExisting = (candidate: string): void => {
    if (paths.has(candidate)) found.add(candidate);
  };
  for (const ref of js.entryRefs) addExisting(ref);
  for (const script of Object.values(js.scripts)) {
    for (const token of scriptTokens(script)) addExisting(token);
  }
  for (const file of files) {
    if (file.language === 'html') {
      for (const source of scriptSources(file)) addExisting(source);
    } else if (isCodePath(file.path) && isEntryFile(file)) {
      found.add(file.path);
    }
  }
  return new Set([...found].sort());
}

function isEntryFile(file: SourceFile): boolean {
  if (file.kind === 'config' || ROOT_ENTRY.test(file.path)) return true;
  if (NEXT_ENTRY_PATTERNS.some((pattern) => pattern.test(file.path))) return true;
  if (file.language !== 'python') return false;
  return PY_ENTRY_NAMES.has(path.posix.basename(file.path)) || PY_MAIN_GUARD.test(file.content ?? '');
}

function scriptTokens(script: string): string[] {
  return script
    .split(/\s+/)
    .map((token) => token.replace(/^['"]+|['"]+$/g, '').replace(/^(?:\.\/)+/, ''))
    .filter((token) => token.length > 0);
}

function scriptSources(file: SourceFile): string[] {
  const dir = path.posix.dirname(file.path);
  const sources: string[] = [];
  for (const match of (file.content ?? '').matchAll(SCRIPT_SRC)) {
    const source = (match[1] ?? '').split(/[?#]/)[0] ?? '';
    if (source === '' || EXTERNAL_URL.test(source)) continue;
    // "/main.js" is served from the site root; the project root is the closest guess.
    sources.push(source.startsWith('/') ? path.posix.normalize(source.slice(1)) : path.posix.join(dir, source));
  }
  return sources;
}
```

Файлы разрешаются только среди узлов графа, поэтому `import './styles.css'` и JSON-импорты не создают рёбер, а
обе карты всегда содержат одинаковый набор ключей.

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run tests/analyzer/import-graph.test.ts tests/analyzer/entry-points.test.ts`
Expected: PASS — `import-graph.test.ts` 14, `entry-points.test.ts` 5 (19 passed).

- [ ] **Step 5: Commit**

```powershell
npm run format
npm run check
git add src/analyzer/import-graph.ts src/analyzer/entry-points.ts tests/analyzer/import-graph.test.ts tests/analyzer/entry-points.test.ts
git commit -m "feat(analyzer): import graph and entry points" -m "Co-Authored-By: <model> <noreply@anthropic.com>"
```

Expected от `npm run check`: без ошибок, все тесты зелёные.

---

### Task 4: Факты тестов, покрытие и метрики

**Files:**
- Create: `src/analyzer/test-facts.ts`, `src/analyzer/metrics.ts`, `tests/analyzer/test-facts.test.ts`,
  `tests/analyzer/metrics.test.ts`

**Interfaces:**
- Consumes: `SourceFile`, `toSourceFile` (Task 1); `ImportGraph`, `buildImportGraph` (Task 3); тестовые помощники
  `sourceFiles`, `makeTempDir`, `cleanupTempDirs`.
- Produces:
  - `countTestCases(file: SourceFile): number`; `countAssertions(file: SourceFile): number`;
  - `interface TestFacts { testFiles: string[]; casesByFile: Record<string, number>;
    assertionsByFile: Record<string, number>; testCasesTotal: number; testCasesByModule: Record<string, number>;
    testedModules: Set<string>; coverage?: number }`;
  - `collectTestFacts(files: SourceFile[], graph: ImportGraph): TestFacts` — `coverage` не заполняет (его добавляет
    `analyzeProject` из `readCoverage`, Task 6);
  - `readCoverage(root: string): Promise<number | undefined>` — доля 0..1;
  - `measureLines(files: SourceFile[]): { codeLines: number; fileLines: Record<string, number> }`;
  - `countBotHandlers(files: SourceFile[]): number`.

- [ ] **Step 1: Написать падающие тесты**

`tests/analyzer/test-facts.test.ts`:

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { type SourceFile, toSourceFile } from '../../src/analyzer/files.js';
import { buildImportGraph } from '../../src/analyzer/import-graph.js';
import { collectTestFacts, countAssertions, countTestCases, readCoverage } from '../../src/analyzer/test-facts.js';
import { sourceFiles } from '../helpers/source-files.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

function file(filePath: string, content: string | null): SourceFile {
  return toSourceFile({ path: filePath, size: content?.length ?? 0, mtimeMs: 0 }, content);
}

describe('countTestCases / countAssertions', () => {
  it('counts JS cases without skipped ones and counts expect/assert calls', () => {
    const test = file(
      'src/cart.test.ts',
      [
        "describe('cart', () => {",
        "  it('adds', () => { expect(add(1)).toBe(1); });",
        "  test('removes', async () => { expect(x).toEqual(y); assert.ok(z); });",
        "  it.only('focus', () => { assert(true); });",
        "  it.skip('later', () => {});",
        "  xit('old', () => {});",
        "  obj.it('not a test');",
        '});',
      ].join('\n'),
    );
    expect(countTestCases(test)).toBe(3);
    expect(countAssertions(test)).toBe(4);
  });

  it('counts Python cases without skip-decorated ones and counts assert statements', () => {
    const test = file(
      'tests/test_bot.py',
      [
        'import pytest',
        '',
        'def test_start():',
        '    assert reply("/start") == "hi"',
        '',
        'async def test_help(bot):',
        '    assert await bot.help()',
        '',
        '@pytest.mark.skip(reason="flaky")',
        '',
        'def test_flaky():',
        '    assert False',
        '',
        'class TestAdmin(unittest.TestCase):',
        '    @unittest.skip("todo")',
        '    def test_ban(self):',
        '        self.assertEqual(ban(1), True)',
        '',
        '    def test_kick(self):',
        '        self.assertTrue(kick(1))',
        '',
        'def helper_test():',
        '    pass',
      ].join('\n'),
    );
    expect(countTestCases(test)).toBe(3);
    expect(countAssertions(test)).toBe(5);
  });

  it('returns 0 for other languages and unread files', () => {
    expect(countTestCases(file('README.md', "it('x', () => {})"))).toBe(0);
    expect(countTestCases(file('src/big.test.ts', null))).toBe(0);
    expect(countAssertions(file('src/big.test.ts', null))).toBe(0);
  });
});

describe('collectTestFacts', () => {
  it('credits directly imported code modules with the cases of each test file', () => {
    const files = sourceFiles({
      'src/cart.ts': 'export const add = (a: number) => a;\n',
      'src/pay.ts': 'export const pay = () => 1;\n',
      'vitest.config.ts': 'export default {};\n',
      'src/cart.test.ts': [
        "import { add } from './cart';",
        "import cfg from '../vitest.config';",
        "it('a', () => expect(add(1)).toBe(1));",
        "it('b', () => expect(add(2)).toBe(2));",
        '',
      ].join('\n'),
      'src/all.test.ts': [
        "import { add } from './cart';",
        "import { pay } from './pay';",
        "import { helper } from './helper.test';",
        "test('c', () => { expect(pay()).toBe(1); });",
        '',
      ].join('\n'),
      'src/helper.test.ts': 'export const helper = 1;\n',
    });
    const facts = collectTestFacts(files, buildImportGraph(files, null));
    expect(facts.testFiles).toEqual(['src/all.test.ts', 'src/cart.test.ts', 'src/helper.test.ts']);
    expect(facts.casesByFile).toEqual({ 'src/all.test.ts': 1, 'src/cart.test.ts': 2, 'src/helper.test.ts': 0 });
    expect(facts.assertionsByFile).toEqual({ 'src/all.test.ts': 1, 'src/cart.test.ts': 2, 'src/helper.test.ts': 0 });
    expect(facts.testCasesTotal).toBe(3);
    expect(facts.testCasesByModule).toEqual({ 'src/cart.ts': 3, 'src/pay.ts': 1 });
    expect([...facts.testedModules]).toEqual(['src/cart.ts', 'src/pay.ts']);
    expect(facts.coverage).toBeUndefined();
  });
});

describe('readCoverage', () => {
  it('reads total line percent from coverage-summary.json', async () => {
    const root = await makeTempDir();
    await mkdir(path.join(root, 'coverage'));
    await writeFile(
      path.join(root, 'coverage', 'coverage-summary.json'),
      JSON.stringify({ total: { lines: { total: 8, covered: 7, pct: 87.5 } } }),
    );
    expect(await readCoverage(root)).toBe(0.875);
  });

  it('reads line-rate from coverage.xml', async () => {
    const root = await makeTempDir();
    await writeFile(
      path.join(root, 'coverage.xml'),
      '<?xml version="1.0" ?>\n<coverage version="7.4" line-rate="0.62" branch-rate="0">\n</coverage>\n',
    );
    expect(await readCoverage(root)).toBe(0.62);
  });

  it('returns undefined without a readable report', async () => {
    const empty = await makeTempDir();
    expect(await readCoverage(empty)).toBeUndefined();
    const broken = await makeTempDir();
    await mkdir(path.join(broken, 'coverage'));
    await writeFile(path.join(broken, 'coverage', 'coverage-summary.json'), '{broken');
    expect(await readCoverage(broken)).toBeUndefined();
  });
});
```

`tests/analyzer/metrics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { countBotHandlers, measureLines } from '../../src/analyzer/metrics.js';
import { sourceFiles } from '../helpers/source-files.js';

describe('measureLines', () => {
  it('counts lines of code and test files and non-blank lines of code', () => {
    const files = sourceFiles({
      'src/a.ts': 'const a = 1;\n\n  \nconst b = 2;\n',
      'src/a.test.ts': "it('x', () => {});\n",
      'src/b.py': 'x = 1\n',
      'vite.config.ts': 'export default {};\n',
      'README.md': '# x\n',
    });
    expect(measureLines(files)).toEqual({
      codeLines: 3,
      fileLines: { 'src/a.test.ts': 1, 'src/a.ts': 4, 'src/b.py': 1 },
    });
  });
});

describe('countBotHandlers', () => {
  it('counts handler registrations in JS/TS code files only', () => {
    const files = sourceFiles({
      'src/bot.ts': [
        "bot.start((ctx) => ctx.reply('hi'));",
        "bot.help((ctx) => ctx.reply('help'));",
        "bot.command('ban', ban);",
        'bot.hears(/hello/, greet);',
        "bot.on('text', echo);",
        "composer.action('ok', ok);",
        'router.onText(/\\/echo/, echo);',
        'bot.launch();',
        "robot.on('x', y);",
      ].join('\n'),
      'src/bot.test.ts': "bot.command('x', y);\n",
      'scripts/bot.py': "bot.command('x')\n",
    });
    expect(countBotHandlers(files)).toBe(7);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run tests/analyzer/test-facts.test.ts tests/analyzer/metrics.test.ts`
Expected: FAIL — не найдены модули `src/analyzer/test-facts.js` и `src/analyzer/metrics.js`.

- [ ] **Step 3: Реализовать**

`src/analyzer/test-facts.ts`:

```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SourceFile } from './files.js';
import type { ImportGraph } from './import-graph.js';

export interface TestFacts {
  /** Paths of kind 'test' files, sorted. */
  testFiles: string[];
  casesByFile: Record<string, number>;
  assertionsByFile: Record<string, number>;
  testCasesTotal: number;
  /** Code module → sum of the cases of the test files that import it directly. */
  testCasesByModule: Record<string, number>;
  testedModules: Set<string>;
  /** Line coverage 0..1 from a report on disk, when one exists. */
  coverage?: number;
}

// Lookbehind drops xit(, obj.it( and it.skip( (the latter never reaches "\s*\(").
const JS_CASE = /(?<![\w.$])(?:it|test)(?:\.only)?\s*\(/g;
const JS_ASSERTIONS: readonly RegExp[] = [/\bexpect\s*\(/g, /\bassert(?:\.\w+)?\s*\(/g];
const PY_CASE = /^\s*(?:async\s+)?def\s+test_\w*\s*\(/;
const PY_SKIP_DECORATOR = /^\s*@(?:pytest\.mark\.skip|unittest\.skip)/;
const PY_ASSERTIONS: readonly RegExp[] = [/^\s*assert\b/gm, /\bself\.assert\w+\s*\(/g];
const XML_LINE_RATE = /<coverage\b[^>]*?\sline-rate="([\d.]+)"/;

export function countTestCases(file: SourceFile): number {
  if (file.content === null) return 0;
  if (file.language === 'python') return countPythonCases(file.lines);
  return isJsLike(file) ? countMatches(file.content, JS_CASE) : 0;
}

export function countAssertions(file: SourceFile): number {
  const content = file.content;
  if (content === null) return 0;
  return assertionPatterns(file).reduce((sum, pattern) => sum + countMatches(content, pattern), 0);
}

export function collectTestFacts(files: SourceFile[], graph: ImportGraph): TestFacts {
  const byPath = new Map<string, SourceFile>(files.map((file) => [file.path, file]));
  const testFiles = files
    .filter((file) => file.kind === 'test')
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const cases = new Map<string, number>();
  const assertions = new Map<string, number>();
  const casesByModule = new Map<string, number>();
  let testCasesTotal = 0;
  for (const testFile of testFiles) {
    const count = countTestCases(testFile);
    cases.set(testFile.path, count);
    assertions.set(testFile.path, countAssertions(testFile));
    testCasesTotal += count;
    for (const target of graph.imports.get(testFile.path) ?? []) {
      if (byPath.get(target)?.kind !== 'code') continue;
      casesByModule.set(target, (casesByModule.get(target) ?? 0) + count);
    }
  }
  const modules = [...casesByModule.keys()].sort();
  return {
    testFiles: testFiles.map((testFile) => testFile.path),
    casesByFile: Object.fromEntries(cases),
    assertionsByFile: Object.fromEntries(assertions),
    testCasesTotal,
    testCasesByModule: Object.fromEntries(modules.map((name) => [name, casesByModule.get(name) ?? 0])),
    testedModules: new Set(modules),
  };
}

/** Reads coverage reports straight from disk: they are usually git-ignored, so listFiles never sees them. */
export async function readCoverage(root: string): Promise<number | undefined> {
  const summary = await readOptional(path.join(root, 'coverage', 'coverage-summary.json'));
  const fromSummary = summary === null ? undefined : summaryLineRate(summary);
  if (fromSummary !== undefined) return fromSummary;
  const xml = await readOptional(path.join(root, 'coverage.xml'));
  const rate = xml?.match(XML_LINE_RATE)?.[1];
  const value = rate === undefined ? Number.NaN : Number(rate);
  return Number.isFinite(value) ? value : undefined;
}

function isJsLike(file: SourceFile): boolean {
  return file.language === 'typescript' || file.language === 'javascript';
}

function assertionPatterns(file: SourceFile): readonly RegExp[] {
  if (file.language === 'python') return PY_ASSERTIONS;
  return isJsLike(file) ? JS_ASSERTIONS : [];
}

function countMatches(content: string, pattern: RegExp): number {
  return content.match(pattern)?.length ?? 0;
}

function countPythonCases(lines: string[]): number {
  let count = 0;
  let previous = '';
  for (const line of lines) {
    if (line.trim() === '') continue;
    // Only a decorator on the previous non-blank line skips the test; a skip elsewhere does not.
    if (PY_CASE.test(line) && !PY_SKIP_DECORATOR.test(previous)) count++;
    previous = line;
  }
  return count;
}

function summaryLineRate(text: string): number | undefined {
  try {
    const parsed = JSON.parse(text) as { total?: { lines?: { pct?: unknown } } } | null;
    const pct = parsed?.total?.lines?.pct;
    // Istanbul writes "Unknown" when there are no lines, hence the type check.
    return typeof pct === 'number' && Number.isFinite(pct) ? pct / 100 : undefined;
  } catch {
    return undefined;
  }
}

function readOptional(file: string): Promise<string | null> {
  return readFile(file, 'utf8').catch(() => null);
}
```

`src/analyzer/metrics.ts`:

```ts
import type { SourceFile } from './files.js';

// Telegraf/grammY (command, hears, action, on, start, help) and node-telegram-bot-api (onText).
const BOT_HANDLER = /\b(?:bot|composer|router)\.(?:command|hears|action|on|start|help|onText)\s*\(/g;

/** fileLines feeds "shrink this file" quests; codeLines ignores blank lines so reformatting does not count. */
export function measureLines(files: SourceFile[]): { codeLines: number; fileLines: Record<string, number> } {
  let codeLines = 0;
  const entries: [string, number][] = [];
  for (const file of files) {
    if (file.kind !== 'code' && file.kind !== 'test') continue;
    entries.push([file.path, file.lines.length]);
    if (file.kind === 'code') codeLines += file.lines.filter((line) => line.trim() !== '').length;
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { codeLines, fileLines: Object.fromEntries(entries) };
}

/** Stage 3 adds Python bot frameworks. */
export function countBotHandlers(files: SourceFile[]): number {
  let count = 0;
  for (const file of files) {
    if (file.kind !== 'code' || file.content === null) continue;
    if (file.language !== 'typescript' && file.language !== 'javascript') continue;
    count += file.content.match(BOT_HANDLER)?.length ?? 0;
  }
  return count;
}
```

`String.prototype.match` с флагом `g` всегда начинает с нуля, поэтому общие глобальные регулярки не копят
`lastIndex` между файлами.

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run tests/analyzer/test-facts.test.ts tests/analyzer/metrics.test.ts`
Expected: PASS — `test-facts.test.ts` 7, `metrics.test.ts` 2 (9 passed).

- [ ] **Step 5: Commit**

```powershell
npm run format
npm run check
git add src/analyzer/test-facts.ts src/analyzer/metrics.ts tests/analyzer/test-facts.test.ts tests/analyzer/metrics.test.ts
git commit -m "feat(analyzer): test facts, coverage and line metrics" -m "Co-Authored-By: <model> <noreply@anthropic.com>"
```

Expected от `npm run check`: без ошибок, все тесты зелёные.

---

### Task 5: Git-история: HEAD, горячие точки, ключ изменений

**Files:**
- Create: `src/analyzer/history.ts`, `tests/analyzer/history.test.ts`
- Modify: `tests/helpers/temp-project.ts` (добавить `initGitRepo`, `commitAll`; `makeGitProject` использует их)

**Interfaces:**
- Consumes: `runGit` (Task 1), `ListedFile` (Task 1).
- Produces:
  - `readHead(root: string): Promise<string | null>` — `null` вне git и в репозитории без коммитов;
  - `const HOTSPOT_MIN_COMMITS = 10`, `const HOTSPOT_MIN_FIXES = 3`;
    `readHotspots(root: string): Promise<string[]>` — отсортированные пути; ошибка git → `[]`;
  - `computeChangeKey(head: string | null, files: ListedFile[]): string` — 16 hex-символов;
  - тестовые помощники: `initGitRepo(dir: string): Promise<void>`, `commitAll(dir: string, message: string): Promise<void>`.

- [ ] **Step 1: Написать падающие тесты**

`tests/analyzer/history.test.ts`:

```ts
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { computeChangeKey, readHead, readHotspots } from '../../src/analyzer/history.js';
import { cleanupTempDirs, commitAll, initGitRepo, makeGitProject, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

// 3 fix-like subjects + 6 others; with the initial commit hot.ts gets 10 commits, warm.ts 9.
const SUBJECTS = [
  'fix: cart total',
  'Bug in rounding',
  'hotfix login',
  'feat: step 1',
  'feat: step 2',
  'feat: step 3',
  'feat: step 4',
  'feat: step 5',
  'feat: step 6',
];

describe('readHotspots', () => {
  it('reports files with 10+ commits and 3+ fixes in the last 90 days', { timeout: 60_000 }, async () => {
    const dir = await makeGitProject({ 'src/hot.ts': 'export const v = 0;\n', 'src/warm.ts': 'export const v = 0;\n' });
    for (const [index, subject] of SUBJECTS.entries()) {
      await writeFile(path.join(dir, 'src', 'hot.ts'), `export const v = ${index + 1};\n`);
      if (index < 8) await writeFile(path.join(dir, 'src', 'warm.ts'), `export const v = ${index + 1};\n`);
      await commitAll(dir, subject);
    }
    expect(await readHotspots(dir)).toEqual(['src/hot.ts']);
  });

  it('returns [] outside git and in a repository without commits', async () => {
    const plain = await makeTempDir();
    const empty = await makeTempDir();
    await initGitRepo(empty);
    expect(await readHotspots(plain)).toEqual([]);
    expect(await readHotspots(empty)).toEqual([]);
  });
});

describe('readHead', () => {
  it('returns the commit id and follows new commits', async () => {
    const dir = await makeGitProject();
    const first = await readHead(dir);
    expect(first).toMatch(/^[0-9a-f]{40}$/);
    await commitAll(dir, 'empty commit');
    const second = await readHead(dir);
    expect(second).toMatch(/^[0-9a-f]{40}$/);
    expect(second).not.toBe(first);
  });

  it('returns null in an empty repository and outside git', async () => {
    const plain = await makeTempDir();
    const empty = await makeTempDir();
    await initGitRepo(empty);
    expect(await readHead(plain)).toBeNull();
    expect(await readHead(empty)).toBeNull();
  });
});

describe('computeChangeKey', () => {
  const a = { path: 'a.ts', size: 10, mtimeMs: 1000.7 };
  const b = { path: 'b.ts', size: 5, mtimeMs: 2000 };

  it('is stable for the same input, file order and sub-millisecond mtime noise', () => {
    const key = computeChangeKey('abc', [a, b]);
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(computeChangeKey('abc', [{ ...a }, { ...b }])).toBe(key);
    expect(computeChangeKey('abc', [b, a])).toBe(key);
    expect(computeChangeKey('abc', [{ ...a, mtimeMs: 1000.2 }, b])).toBe(key);
  });

  it('changes with a file size, the head or the file set', () => {
    const key = computeChangeKey('abc', [a, b]);
    expect(computeChangeKey('abc', [{ ...a, size: 11 }, b])).not.toBe(key);
    expect(computeChangeKey('def', [a, b])).not.toBe(key);
    expect(computeChangeKey(null, [a, b])).not.toBe(key);
    expect(computeChangeKey('abc', [a])).not.toBe(key);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run tests/analyzer/history.test.ts`
Expected: FAIL — не найден модуль `src/analyzer/history.js` (и в `temp-project.ts` ещё нет `commitAll`, `initGitRepo`).

- [ ] **Step 3: Реализовать**

`tests/helpers/temp-project.ts` — полностью:

```ts
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const TMP_BASE = path.resolve(import.meta.dirname, '..', '..', '.tmp');

const created: string[] = [];

// Fixed identity and no signing: tests must not depend on the developer's git config.
const COMMIT_FLAGS = [
  '-c',
  'user.name=CodeQuest Test',
  '-c',
  'user.email=test@example.invalid',
  '-c',
  'commit.gpgsign=false',
];

/** Empty folder whose path has a space and Cyrillic letters: <repo>/.tmp/run XXXXXX/тест проект */
export async function makeTempDir(): Promise<string> {
  await mkdir(TMP_BASE, { recursive: true });
  const base = await mkdtemp(path.join(TMP_BASE, 'run '));
  created.push(base);
  const dir = path.join(base, 'тест проект');
  await mkdir(dir);
  return dir;
}

/** Temp folder with the given files, committed to a fresh git repository. */
export async function makeGitProject(files: Record<string, string> = { 'README.md': '# test\n' }): Promise<string> {
  const dir = await makeTempDir();
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(dir, relative);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  await initGitRepo(dir);
  await commitAll(dir, 'init');
  return dir;
}

/** `git init` on branch main, whatever the user's init.defaultBranch is. */
export async function initGitRepo(dir: string): Promise<void> {
  await git(dir, 'init', '-q', '-b', 'main');
}

/** Stages everything and commits; --allow-empty lets tests add history without touching files. */
export async function commitAll(dir: string, message: string): Promise<void> {
  await git(dir, 'add', '-A');
  await git(dir, ...COMMIT_FLAGS, 'commit', '-q', '--allow-empty', '-m', message);
}

export async function cleanupTempDirs(): Promise<void> {
  for (const dir of created.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await run('git', args, { cwd, windowsHide: true });
}
```

`src/analyzer/history.ts`:

```ts
import { createHash } from 'node:crypto';
import type { ListedFile } from './files.js';
import { runGit } from './git.js';

export const HOTSPOT_MIN_COMMITS = 10;
export const HOTSPOT_MIN_FIXES = 3;

const FIX_SUBJECT = /(fix|bug|hotfix)/i;
const RECORD_SEPARATOR = '\x1e';
const COMMIT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

/** Current commit id; null outside git and in a repository without commits. */
export async function readHead(root: string): Promise<string | null> {
  const result = await runGit(root, ['rev-parse', 'HEAD']);
  const head = result.stdout.trim();
  // In an empty repository rev-parse echoes the literal "HEAD" before failing, so check the shape too.
  return result.ok && COMMIT_ID.test(head) ? head : null;
}

/** Files changed often and fixed often in the last 90 days, sorted; any git failure → []. */
export async function readHotspots(root: string): Promise<string[]> {
  const result = await runGit(root, [
    '-c',
    'core.quotePath=false',
    'log',
    '--since=90 days ago',
    '--no-merges',
    '--name-only',
    '--format=%x1e%s',
  ]);
  if (!result.ok) return [];
  const commits = new Map<string, number>();
  const fixes = new Map<string, number>();
  // Each record: subject line, blank line, one changed path per line. The text before the first separator is empty.
  for (const record of result.stdout.split(RECORD_SEPARATOR)) {
    const [subject = '', ...rest] = record.split(/\r?\n/);
    const isFix = FIX_SUBJECT.test(subject);
    for (const file of new Set(rest.filter((line) => line.trim() !== ''))) {
      commits.set(file, (commits.get(file) ?? 0) + 1);
      if (isFix) fixes.set(file, (fixes.get(file) ?? 0) + 1);
    }
  }
  const hotspots: string[] = [];
  for (const [file, count] of commits) {
    if (count >= HOTSPOT_MIN_COMMITS && (fixes.get(file) ?? 0) >= HOTSPOT_MIN_FIXES) hotspots.push(file);
  }
  return hotspots.sort();
}

/** Cheap fingerprint of the working tree: the same key means the previous snapshot is still valid. */
export function computeChangeKey(head: string | null, files: ListedFile[]): string {
  // mtime is truncated to whole ms: some file systems report sub-ms noise between two stat calls.
  const lines = files.map((file) => `${file.path}\t${file.size}\t${Math.trunc(file.mtimeMs)}`).sort();
  return createHash('sha256')
    .update(`${head ?? 'no-git'}\n${lines.join('\n')}`)
    .digest('hex')
    .slice(0, 16);
}
```

`--since=90 days ago` передаётся одним аргументом через `execFile` (без shell), поэтому кавычки не нужны.
`readHotspots` возвращает и удалённые файлы — `analyzeProject` (Task 6) оставляет только те, что есть в списке файлов.

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run`
Expected: PASS — `history.test.ts` 6; тесты, которые пользуются `makeGitProject`, по-прежнему зелёные (помощник
теперь коммитит через `commitAll`).

- [ ] **Step 5: Commit**

```powershell
npm run format
npm run check
git add src/analyzer/history.ts tests/analyzer/history.test.ts tests/helpers/temp-project.ts
git commit -m "feat(analyzer): git head, hotspots and change key" -m "Co-Authored-By: <model> <noreply@anthropic.com>"
```

Expected от `npm run check`: без ошибок, все тесты зелёные.

---

### Task 6: Контекст анализа, находки, каркас правил, `analyzeProject`, фикстуры и правило `generic/todo`

**Files:**
- Create: `src/analyzer/context.ts`, `src/analyzer/findings.ts`, `src/analyzer/facts.ts`, `src/analyzer/analyze.ts`,
  `src/analyzer/rules/types.ts`, `src/analyzer/rules/text.ts`, `src/analyzer/rules/todo.ts`,
  `src/analyzer/rules/index.ts`
- Create: `tests/helpers/fixtures.ts`, `tests/helpers/rule-context.ts`
- Create: `tests/analyzer/findings.test.ts`, `tests/analyzer/rule-text.test.ts`, `tests/analyzer/facts.test.ts`,
  `tests/analyzer/analyze.test.ts`, `tests/analyzer/todo.test.ts`, `tests/analyzer/fixture-harness.test.ts`,
  `tests/analyzer/rule-fixtures.test.ts`
- Create: `tests/fixtures/harness/{_gitignore,_env.example,src/app.ts}`,
  `tests/fixtures/rules/generic.todo/{bad,good}/src/app.ts`

**Interfaces:**
- Consumes: `listFiles`, `loadFiles`, `toSourceFile`, `isCodePath`, `SourceFile`, `Language`, `FileKind` (Task 1);
  `readJsProject`, `JsProject` (Task 2); `buildImportGraph`, `GRAPH_LANGUAGES`, `ImportGraph`, `findEntryPoints`
  (Task 3); `collectTestFacts`, `readCoverage`, `TestFacts`, `measureLines`, `countBotHandlers` (Task 4); `readHead`,
  `readHotspots`, `computeChangeKey` (Task 5); тестовые помощники `sourceFiles` (Task 2), `initGitRepo`, `commitAll`
  (Task 5), `makeTempDir`, `makeGitProject`, `cleanupTempDirs`; типы `Finding`, `Facts`, `Snapshot`, `Severity`.
- Produces:
  - `interface AnalysisContext { root; files; byPath; isGitRepo; tracked; js; graph; graphLanguages; entryPoints;
    tests; facts }`; `isModule(file: SourceFile): boolean`;
  - `type FindingCategory`; `interface RuleHit { file?; line?; message; key; severity? }`;
    `interface Rule { id; category; severity; run(ctx: AnalysisContext): RuleHit[] }`;
  - `isCommentLine(text)`, `matchLines(file, pattern): LineMatch[]`, `matchContent(file, pattern): ContentMatch[]`,
    `JS_LANGUAGES: ReadonlySet<Language>` (typescript, javascript — для правил `js/*`);
  - `findingId(rule, file, key)`, `lineKey(text)`, `toFindings(rule, hits): Finding[]`;
  - `interface FactsInput { files; js; tests; measure; botHandlers; hotspots }`, `buildFacts(input): Facts`;
  - `interface AnalyzeOptions { now: Date; rules?: readonly Rule[] }`,
    `analyzeProject(root, options): Promise<Snapshot>`;
    `interface ContextInput { root; files; isGitRepo; tracked; hotspots?; coverage? }`,
    `buildContext(input: ContextInput): AnalysisContext` — синхронная сборка контекста без диска и git (её же
    используют unit-тесты правил);
  - `RULES: readonly Rule[]`; `todoRule`;
  - тестовые помощники: `FIXTURES_DIR`, `FAKE_SECRETS`, `copyFixture(relative, { git? })`;
    `runRule(rule, files: Record<string, string>, git?: { tracked: string[] }): RuleHit[]`.

`buildContext` вынесен из `analyzeProject`, чтобы правило можно было проверить на строках в памяти: вся работа с
диском и git (список файлов, чтение, `readHead`, `readHotspots`, `readCoverage`) остаётся в `analyzeProject`, а
`buildContext` — чистая функция. Поле `entryPoints` в `FactsInput` из заметок не нужно фактам — не добавляю.

- [ ] **Step 1: Написать падающие unit-тесты**

`tests/analyzer/findings.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { findingId, lineKey, toFindings } from '../../src/analyzer/findings.js';
import type { Rule } from '../../src/analyzer/rules/types.js';

const rule: Rule = { id: 'generic/todo', category: 'clean-code', severity: 'low', run: () => [] };

describe('findingId', () => {
  it('is the first 16 hex chars of sha256(rule \\n file \\n key), file "" when absent', () => {
    const expected = createHash('sha256').update('generic/todo\nsrc/a.ts\nTODO:x').digest('hex').slice(0, 16);
    expect(findingId('generic/todo', 'src/a.ts', 'TODO:x')).toBe(expected);
    expect(findingId('generic/no-readme', undefined, '')).toBe(findingId('generic/no-readme', '', ''));
  });
});

describe('lineKey', () => {
  it('trims and collapses whitespace', () => {
    expect(lineKey('  } catch (e)\t{   }  ')).toBe('} catch (e) { }');
  });
});

describe('toFindings', () => {
  it('numbers repeated keys per file in hit order, so ids do not depend on line numbers', () => {
    const findings = toFindings(rule, [
      { file: 'a.ts', line: 1, message: 'm', key: 'k' },
      { file: 'a.ts', line: 9, message: 'm', key: 'k' },
      { file: 'b.ts', line: 2, message: 'm', key: 'k' },
      { file: 'a.ts', line: 20, message: 'm', key: 'k' },
    ]);
    expect(findings.map((finding) => finding.key)).toEqual(['k', 'k#2', 'k', 'k#3']);
    expect(findings[0]?.id).toBe(findingId('generic/todo', 'a.ts', 'k'));
    const moved = toFindings(rule, [{ file: 'a.ts', line: 50, message: 'm', key: 'k' }]);
    expect(moved[0]?.id).toBe(findings[0]?.id);
  });

  it('takes category and severity from the rule unless the hit overrides severity', () => {
    const findings = toFindings(rule, [
      { message: 'no file', key: '' },
      { file: 'a.ts', line: 3, message: 'x', key: 'y', severity: 'high' },
    ]);
    expect(findings).toEqual([
      {
        id: findingId('generic/todo', undefined, ''),
        rule: 'generic/todo',
        category: 'clean-code',
        severity: 'low',
        message: 'no file',
        key: '',
      },
      {
        id: findingId('generic/todo', 'a.ts', 'y'),
        rule: 'generic/todo',
        category: 'clean-code',
        severity: 'high',
        file: 'a.ts',
        line: 3,
        message: 'x',
        key: 'y',
      },
    ]);
    expect(findings[0]).not.toHaveProperty('file');
    expect(findings[0]).not.toHaveProperty('line');
  });
});
```

`tests/analyzer/rule-text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toSourceFile } from '../../src/analyzer/files.js';
import { isCommentLine, matchContent, matchLines } from '../../src/analyzer/rules/text.js';

function file(filePath: string, content: string | null) {
  return toSourceFile({ path: filePath, size: content?.length ?? 0, mtimeMs: 0 }, content);
}

describe('isCommentLine', () => {
  it.each([
    ['// note', true],
    ['   /* block', true],
    [' * jsdoc line', true],
    ['# python', true],
    ['<!-- html -->', true],
    ['const a = 1; // trailing', false],
    ['', false],
  ] as const)('%j → %s', (text, expected) => {
    expect(isCommentLine(text)).toBe(expected);
  });
});

describe('matchLines', () => {
  it('returns 1-based lines and ignores the global flag of the pattern', () => {
    const matches = matchLines(file('a.ts', 'a\nfoo 1\nb\nfoo 2\n'), /foo (\d)/g);
    expect(matches.map((m) => [m.line, m.text, m.match[1]])).toEqual([
      [2, 'foo 1', '1'],
      [4, 'foo 2', '2'],
    ]);
  });
});

describe('matchContent', () => {
  it('turns match positions into line numbers for LF and CRLF content', () => {
    const crlf = file('a.ts', 'x();\r\ntry {\r\n  y();\r\n} catch {\r\n}\r\n');
    expect(matchContent(crlf, /catch\s*\{\s*\}/g).map((m) => m.line)).toEqual([4]);
    const lf = file('b.ts', 'a\nb b\nc\nb\n');
    expect(matchContent(lf, /b/g).map((m) => m.line)).toEqual([2, 2, 4]);
  });

  it('returns nothing for files that were not read', () => {
    expect(matchContent(file('big.ts', null), /x/g)).toEqual([]);
  });
});
```

`tests/analyzer/facts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildFacts } from '../../src/analyzer/facts.js';
import type { JsProject } from '../../src/analyzer/js-project.js';
import type { TestFacts } from '../../src/analyzer/test-facts.js';
import { sourceFiles } from '../helpers/source-files.js';

function jsProject(overrides: Partial<JsProject> = {}): JsProject {
  return {
    hasPackageJson: false,
    dependencies: [],
    scripts: {},
    packageManager: 'npm',
    frameworks: [],
    testRunner: null,
    commands: {},
    entryRefs: [],
    aliasBase: null,
    ...overrides,
  };
}

function testFacts(overrides: Partial<TestFacts> = {}): TestFacts {
  return {
    testFiles: [],
    casesByFile: {},
    assertionsByFile: {},
    testCasesTotal: 0,
    testCasesByModule: {},
    testedModules: new Set(),
    ...overrides,
  };
}

describe('buildFacts', () => {
  it('counts languages, stacks, source files and modules', () => {
    const files = sourceFiles({
      'src/a.ts': 'export const a = 1;\n',
      'src/a.test.ts': "it('a', () => {});\n",
      'src/types.d.ts': 'declare const x: number;\n',
      'vite.config.ts': 'export default {};\n',
      'bot.py': 'print(1)\n',
      'index.html': '<p></p>\n',
      'README.md': '# x\n',
    });
    const facts = buildFacts({
      files,
      js: jsProject({ frameworks: ['react'], commands: { test: 'npm test' } }),
      tests: testFacts({
        testCasesTotal: 1,
        testCasesByModule: { 'src/a.ts': 1 },
        testedModules: new Set(['src/a.ts']),
      }),
      measure: { codeLines: 2, fileLines: { 'src/a.ts': 1, 'bot.py': 1 } },
      botHandlers: 0,
      hotspots: [],
    });
    expect(facts).toEqual({
      languages: { html: 1, python: 1, typescript: 4 },
      stacks: ['js', 'python'],
      frameworks: ['react'],
      domains: [],
      commands: { test: 'npm test' },
      sourceFiles: 5,
      modules: 2,
      modulesWithTests: 1,
      testCasesTotal: 1,
      testCasesByModule: { 'src/a.ts': 1 },
      codeLines: 2,
      fileLines: { 'bot.py': 1, 'src/a.ts': 1 },
      botHandlers: 0,
      hotspots: [],
    });
    expect(Object.keys(facts.languages)).toEqual(['html', 'python', 'typescript']);
    expect(Object.keys(facts.fileLines)).toEqual(['bot.py', 'src/a.ts']);
    expect(facts).not.toHaveProperty('coverage');
  });

  it('marks a package.json-only project as js and passes coverage through', () => {
    const facts = buildFacts({
      files: sourceFiles({ 'package.json': '{}', 'index.html': '<p></p>\n' }),
      js: jsProject({ hasPackageJson: true }),
      tests: testFacts({ coverage: 0.5 }),
      measure: { codeLines: 0, fileLines: {} },
      botHandlers: 3,
      hotspots: ['index.html'],
    });
    expect(facts.stacks).toEqual(['js']);
    expect(facts.languages).toEqual({ html: 1 });
    expect(facts.coverage).toBe(0.5);
    expect(facts.botHandlers).toBe(3);
    expect(facts.hotspots).toEqual(['index.html']);
  });
});
```

`tests/analyzer/analyze.test.ts`:

```ts
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/analyzer/analyze.js';
import { todoRule } from '../../src/analyzer/rules/todo.js';
import type { Rule } from '../../src/analyzer/rules/types.js';
import { cleanupTempDirs, initGitRepo, makeGitProject, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

const NOW = new Date('2026-09-29T12:00:00.000Z');

describe('analyzeProject', () => {
  it('works in an empty repository without commits', async () => {
    const dir = await makeTempDir();
    await initGitRepo(dir);
    const snapshot = await analyzeProject(dir, { now: NOW });
    expect(snapshot.schema).toBe(1);
    expect(snapshot.takenAt).toBe('2026-09-29T12:00:00.000Z');
    expect(snapshot.head).toBeNull();
    expect(snapshot.errors).toEqual([]);
    expect(snapshot.facts.sourceFiles).toBe(0);
    expect(snapshot.changeKey).toMatch(/^[0-9a-f]{16}$/);
    const todoOnly = await analyzeProject(dir, { now: NOW, rules: [todoRule] });
    expect(todoOnly.findings).toEqual([]);
  });

  it('records a throwing rule in errors and still runs the others', async () => {
    const root = await makeGitProject({ 'src/a.ts': '// TODO: later\n' });
    const boom: Rule = {
      id: 'test/boom',
      category: 'bug',
      severity: 'low',
      run() {
        throw new Error('boom');
      },
    };
    const snapshot = await analyzeProject(root, { now: NOW, rules: [boom, todoRule] });
    expect(snapshot.errors).toEqual([{ rule: 'test/boom', message: 'boom' }]);
    expect(snapshot.findings.map((finding) => finding.rule)).toEqual(['generic/todo']);
    expect(snapshot.head).toMatch(/^[0-9a-f]{40}$/);
  });

  it('sorts findings by file and line and numbers repeated keys', async () => {
    const root = await makeGitProject({
      'src/b.ts': 'export const b = 1;\n\n// TODO: later\n',
      'src/a.ts': '// TODO: same\nexport const a = 1;\n\n\n// TODO: same\n',
    });
    const snapshot = await analyzeProject(root, { now: NOW, rules: [todoRule] });
    expect(snapshot.findings.map((finding) => [finding.file, finding.line, finding.key])).toEqual([
      ['src/a.ts', 1, 'TODO:same'],
      ['src/a.ts', 5, 'TODO:same#2'],
      ['src/b.ts', 3, 'TODO:later'],
    ]);
  });

  it('gives the same snapshot twice, except takenAt', async () => {
    const root = await makeGitProject({
      'package.json': '{ "name": "demo", "scripts": { "test": "vitest run" } }\n',
      'src/index.ts': "import { sum } from './sum.js';\n// FIXME: wire up\nconsole.log(sum(1, 2));\n",
      'src/sum.ts': 'export const sum = (a: number, b: number): number => a + b;\n',
      'src/sum.test.ts': "import { sum } from './sum.js';\nit('adds', () => expect(sum(1, 2)).toBe(3));\n",
    });
    const first = await analyzeProject(root, { now: NOW });
    const second = await analyzeProject(root, { now: new Date(NOW.getTime() + 60_000) });
    expect(second.takenAt).not.toBe(first.takenAt);
    expect({ ...second, takenAt: first.takenAt }).toEqual(first);
  });

  it('analyzes a folder outside git', async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, 'app.js'), '// FIXME: broken\n');
    const snapshot = await analyzeProject(dir, { now: NOW, rules: [todoRule] });
    expect(snapshot.head).toBeNull();
    expect(snapshot.facts.hotspots).toEqual([]);
    expect(snapshot.findings).toMatchObject([
      { rule: 'generic/todo', file: 'app.js', line: 1, message: 'FIXME: broken' },
    ]);
  });
});
```

`tests/analyzer/todo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { todoRule } from '../../src/analyzer/rules/todo.js';
import { runRule } from '../helpers/rule-context.js';

describe('generic/todo', () => {
  it('reads markers from JS, Python, HTML and CSS comments only', () => {
    const hits = runRule(todoRule, {
      'src/a.ts': '// TODO: Handle   Discounts\nconst todo = "TODO";\n',
      'bot.py': 'x = 1  # FIXME retry\n',
      'index.html': '<!-- HACK: inline styles -->\n',
      'style.css': '/* XXX - legacy grid */\n',
      'notes.md': '// TODO: not code\n',
    });
    expect(hits).toEqual([
      { file: 'bot.py', line: 1, message: 'FIXME: retry', key: 'FIXME:retry' },
      { file: 'index.html', line: 1, message: 'HACK: inline styles', key: 'HACK:inline styles' },
      { file: 'src/a.ts', line: 1, message: 'TODO: Handle   Discounts', key: 'TODO:handle discounts' },
      { file: 'style.css', line: 1, message: 'XXX: legacy grid', key: 'XXX:legacy grid' },
    ]);
  });

  it('ignores words that only contain a marker', () => {
    expect(runRule(todoRule, { 'src/a.ts': '// TODOS and autodoc\n' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Написать фикстуры, помощники и тесты фикстур**

`tests/helpers/fixtures.ts`:

```ts
import { cp, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { commitAll, initGitRepo, makeTempDir } from './temp-project.js';

export const FIXTURES_DIR = path.resolve(import.meta.dirname, '..', 'fixtures');

// Assembled at runtime so that no file in the repository contains a string that secret scanners
// (or our own generic/hardcoded-secret rule) would flag.
export const FAKE_SECRETS = {
  STRIPE_LIVE: ['sk', 'live', 'Zx'.repeat(12)].join('_'),
  STRIPE_TEST: ['sk', 'test', 'Qw'.repeat(12)].join('_'),
  TELEGRAM: ['123456789', `AAH${'x'.repeat(32)}`].join(':'),
  AWS: ['AKIA', 'IOSFODNN7EXAMPLE'].join(''),
  GITHUB: ['ghp', 'a'.repeat(36)].join('_'),
  PRIVATE_KEY: ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' '),
} satisfies Record<string, string>;

const SECRETS_BY_NAME: Record<string, string> = FAKE_SECRETS;
const PLACEHOLDER = /__FAKE_([A-Z0-9_]+?)__/g;

/**
 * Copies tests/fixtures/<relative> into a fresh temp folder, turns `_gitignore` / `_env…` into dot-files,
 * fills `__FAKE_<NAME>__` placeholders and (by default) commits everything to a new git repository.
 */
export async function copyFixture(relative: string, options: { git?: boolean } = {}): Promise<string> {
  const dir = await makeTempDir();
  await cp(path.join(FIXTURES_DIR, relative), dir, { recursive: true });
  await materialize(dir);
  if (options.git ?? true) {
    await initGitRepo(dir);
    await commitAll(dir, 'fixture');
  }
  return dir;
}

async function materialize(folder: string): Promise<void> {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      await materialize(full);
      continue;
    }
    const target = path.join(folder, realName(entry.name));
    if (target !== full) await rename(full, target);
    const text = await readFile(target, 'utf8');
    if (text.includes('__FAKE_')) await writeFile(target, text.replace(PLACEHOLDER, fakeSecret));
  }
}

function realName(name: string): string {
  if (name === '_gitignore') return '.gitignore';
  if (name.startsWith('_env')) return `.env${name.slice('_env'.length)}`;
  return name;
}

function fakeSecret(_placeholder: string, name: string): string {
  const value = SECRETS_BY_NAME[name];
  // A typo in a fixture must fail loudly instead of leaving a placeholder that no rule would flag.
  if (value === undefined) throw new Error(`Unknown fixture placeholder __FAKE_${name}__`);
  return value;
}
```

`FAKE_SECRETS` объявлен через `satisfies Record<string, string>`, а не с аннотацией: так `FAKE_SECRETS.TELEGRAM`
имеет тип `string`, а не `string | undefined` (при `noUncheckedIndexedAccess`). Строки собраны через `join`, а не
`+`, чтобы Biome не требовал шаблонных строк.

`tests/helpers/rule-context.ts`:

```ts
import { buildContext } from '../../src/analyzer/analyze.js';
import type { Rule, RuleHit } from '../../src/analyzer/rules/types.js';
import { sourceFiles } from './source-files.js';

/** Runs one rule over in-memory files; `git` makes the context a repository with the given tracked paths. */
export function runRule(rule: Rule, files: Record<string, string>, git?: { tracked: string[] }): RuleHit[] {
  const context = buildContext({
    root: '',
    files: sourceFiles(files),
    isGitRepo: git !== undefined,
    tracked: new Set(git?.tracked ?? []),
  });
  return rule.run(context);
}
```

Фикстура самого помощника — `tests/fixtures/harness/`:

`tests/fixtures/harness/_gitignore`:

```text
node_modules/
```

`tests/fixtures/harness/_env.example`:

```text
BOT_TOKEN=__FAKE_TELEGRAM__
```

`tests/fixtures/harness/src/app.ts`:

```ts
export const app = 'harness';
```

Фикстура правила — `tests/fixtures/rules/generic.todo/`:

`tests/fixtures/rules/generic.todo/bad/src/app.ts`:

```ts
export function total(prices: number[]): number {
  // TODO: apply discounts before summing
  return prices.reduce((sum, price) => sum + price, 0);
}
```

`tests/fixtures/rules/generic.todo/good/src/app.ts`:

```ts
export function total(prices: number[]): number {
  return prices.reduce((sum, price) => sum + price, 0);
}
```

`tests/analyzer/fixture-harness.test.ts`:

```ts
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runGit } from '../../src/analyzer/git.js';
import { copyFixture, FAKE_SECRETS } from '../helpers/fixtures.js';
import { cleanupTempDirs } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

describe('copyFixture', () => {
  it('turns stand-ins into dot-files and fills fake secrets', async () => {
    const dir = await copyFixture('harness', { git: false });
    expect(await readFile(path.join(dir, '.gitignore'), 'utf8')).toBe('node_modules/\n');
    expect(await readFile(path.join(dir, '.env.example'), 'utf8')).toBe(`BOT_TOKEN=${FAKE_SECRETS.TELEGRAM}\n`);
    await expect(access(path.join(dir, '_gitignore'))).rejects.toThrow();
    expect((await runGit(dir, ['rev-parse', '--git-dir'])).ok).toBe(false);
  });

  it('commits the copy to a fresh git repository by default', async () => {
    const dir = await copyFixture('harness');
    const listed = await runGit(dir, ['ls-files']);
    expect(listed.stdout.split('\n').filter(Boolean).sort()).toEqual(['.env.example', '.gitignore', 'src/app.ts']);
  });
});
```

Ожидаемый текст `.env.example` сравнивается с `\n` на конце: на Windows `git` с `core.autocrlf` меняет только файлы
при checkout, а `copyFixture` копирует файлы с диска, поэтому окончания строк сохраняются. Если на машине
исполнителя фикстуры в рабочем дереве получили CRLF, добавить в корень репозитория `.gitattributes` со строкой
`tests/fixtures/** -text` и записать это в отчёт.

`tests/analyzer/rule-fixtures.test.ts`:

```ts
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/analyzer/analyze.js';
import { RULES } from '../../src/analyzer/rules/index.js';
import { copyFixture, FIXTURES_DIR } from '../helpers/fixtures.js';
import { cleanupTempDirs } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

const NOW = new Date('2026-09-29T12:00:00.000Z');

// Folder `<scope>.<name>` holds the fixtures of rule `<scope>/<name>`.
const folders = readdirSync(path.join(FIXTURES_DIR, 'rules'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

function ruleIdOf(folder: string): string {
  const dot = folder.indexOf('.');
  return `${folder.slice(0, dot)}/${folder.slice(dot + 1)}`;
}

describe('rule fixtures', () => {
  it('every rule has a fixture folder and every folder belongs to a rule', () => {
    expect(folders.map(ruleIdOf).sort()).toEqual(RULES.map((rule) => rule.id).sort());
  });

  for (const folder of folders) {
    const id = ruleIdOf(folder);
    const rule = RULES.find((candidate) => candidate.id === id);

    it(`${id} finds the problem in bad`, async () => {
      expect(rule, `no rule with id ${id}`).toBeDefined();
      if (!rule) return;
      const snapshot = await analyzeProject(await copyFixture(`rules/${folder}/bad`), { now: NOW, rules: [rule] });
      expect(snapshot.errors).toEqual([]);
      expect(snapshot.findings.filter((finding) => finding.rule === id).length).toBeGreaterThan(0);
    });

    it(`${id} stays silent on good`, async () => {
      expect(rule, `no rule with id ${id}`).toBeDefined();
      if (!rule) return;
      const snapshot = await analyzeProject(await copyFixture(`rules/${folder}/good`), { now: NOW, rules: [rule] });
      expect(snapshot.errors).toEqual([]);
      expect(snapshot.findings).toEqual([]);
    });
  }
});
```

Каждая следующая задача, добавляя правило, добавляет и папку фикстур: первый тест упадёт, если одно есть без
другого.

- [ ] **Step 3: Убедиться, что тесты падают**

Run: `npx vitest run tests/analyzer`
Expected: FAIL — не найдены модули `src/analyzer/findings.js`, `src/analyzer/rules/text.js`,
`src/analyzer/facts.js`, `src/analyzer/analyze.js`, `src/analyzer/rules/todo.js`, `src/analyzer/rules/index.js`.
Тесты задач 1–5 проходят.

- [ ] **Step 4: Реализовать**

`src/analyzer/context.ts`:

```ts
import type { Facts } from '../types.js';
import type { Language, SourceFile } from './files.js';
import type { ImportGraph } from './import-graph.js';
import type { JsProject } from './js-project.js';
import type { TestFacts } from './test-facts.js';

/** Everything a rule may look at. Built once per analysis; rules only read it. */
export interface AnalysisContext {
  root: string;
  files: SourceFile[];
  byPath: Map<string, SourceFile>;
  isGitRepo: boolean;
  /** Paths in the git index; empty outside git. */
  tracked: Set<string>;
  js: JsProject;
  graph: ImportGraph;
  /** Languages the import graph understands; graph rules skip other files. */
  graphLanguages: ReadonlySet<Language>;
  entryPoints: Set<string>;
  tests: TestFacts;
  facts: Facts;
}

/** A module is a code file that is not a test, a config or a type declaration. */
export function isModule(file: SourceFile): boolean {
  return file.kind === 'code' && !file.path.endsWith('.d.ts');
}
```

`src/analyzer/rules/types.ts`:

```ts
import type { Severity } from '../../types.js';
import type { AnalysisContext } from '../context.js';

export type FindingCategory =
  | 'architecture'
  | 'security'
  | 'performance'
  | 'clean-code'
  | 'reliability'
  | 'maintainability'
  | 'testing'
  | 'bug';

export interface RuleHit {
  file?: string;
  line?: number;
  message: string;
  /** Meaning of the finding without a line number; part of Finding.id (spec §3.5). */
  key: string;
  /** Overrides Rule.severity for this hit. */
  severity?: Severity;
}

export interface Rule {
  id: string;
  category: FindingCategory;
  severity: Severity;
  run(ctx: AnalysisContext): RuleHit[];
}
```

`src/analyzer/rules/text.ts`:

```ts
import type { Language, SourceFile } from '../files.js';

/** Languages the js/* rules look at. */
export const JS_LANGUAGES: ReadonlySet<Language> = new Set(['typescript', 'javascript']);

const COMMENT_STARTS = ['//', '/*', '*', '#', '<!--'];

export function isCommentLine(text: string): boolean {
  const trimmed = text.trimStart();
  return COMMENT_STARTS.some((start) => trimmed.startsWith(start));
}

export interface LineMatch {
  /** 1-based. */
  line: number;
  text: string;
  match: RegExpExecArray;
}

export interface ContentMatch {
  /** 1-based line where the match starts. */
  line: number;
  match: RegExpExecArray;
}

/** Tests each line on its own. A non-global copy keeps lastIndex from leaking between lines. */
export function matchLines(file: SourceFile, pattern: RegExp): LineMatch[] {
  const single = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
  const found: LineMatch[] = [];
  for (const [index, text] of file.lines.entries()) {
    const match = single.exec(text);
    if (match) found.push({ line: index + 1, text, match });
  }
  return found;
}

/** For patterns that span lines: scans the whole content and turns match.index into a line number. */
export function matchContent(file: SourceFile, pattern: RegExp): ContentMatch[] {
  const content = file.content;
  if (content === null) return [];
  const flags = pattern.flags.replace('y', '');
  const global = new RegExp(pattern.source, flags.includes('g') ? flags : `${flags}g`);
  const found: ContentMatch[] = [];
  let line = 1;
  let scanned = 0;
  for (let match = global.exec(content); match !== null; match = global.exec(content)) {
    // Counting '\n' works for CRLF too: each \r\n holds exactly one \n.
    for (let index = scanned; index < match.index; index++) {
      if (content.charCodeAt(index) === 10) line++;
    }
    scanned = match.index;
    found.push({ line, match });
    if (match[0].length === 0) global.lastIndex++;
  }
  return found;
}
```

`src/analyzer/findings.ts`:

```ts
import { createHash } from 'node:crypto';
import type { Finding } from '../types.js';
import type { Rule, RuleHit } from './rules/types.js';

export function findingId(rule: string, file: string | undefined, key: string): string {
  return createHash('sha256')
    .update(`${rule}\n${file ?? ''}\n${key}`)
    .digest('hex')
    .slice(0, 16);
}

/** Normalized line text for keys: stable when the line moves or its indentation changes. */
export function lineKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function toFindings(rule: Rule, hits: RuleHit[]): Finding[] {
  const seen = new Map<string, number>();
  return hits.map((hit) => {
    const slot = `${hit.file ?? ''}\n${hit.key}`;
    const count = (seen.get(slot) ?? 0) + 1;
    seen.set(slot, count);
    // Repeats are numbered in hit order, so the id never depends on a line number.
    const key = count === 1 ? hit.key : `${hit.key}#${count}`;
    return {
      id: findingId(rule.id, hit.file, key),
      rule: rule.id,
      category: rule.category,
      severity: hit.severity ?? rule.severity,
      ...(hit.file === undefined ? {} : { file: hit.file }),
      ...(hit.line === undefined ? {} : { line: hit.line }),
      message: hit.message,
      key,
    };
  });
}
```

`src/analyzer/facts.ts`:

```ts
import type { Facts } from '../types.js';
import { isModule } from './context.js';
import { isCodePath, type Language, type SourceFile } from './files.js';
import type { JsProject } from './js-project.js';
import type { TestFacts } from './test-facts.js';

export interface FactsInput {
  files: SourceFile[];
  js: JsProject;
  tests: TestFacts;
  measure: { codeLines: number; fileLines: Record<string, number> };
  botHandlers: number;
  hotspots: string[];
}

// Alphabetical, so `languages` keys come out sorted.
const FACT_LANGUAGES: readonly Language[] = ['css', 'html', 'javascript', 'python', 'typescript'];

export function buildFacts(input: FactsInput): Facts {
  const { files, js, tests } = input;
  const languages: Record<string, number> = {};
  for (const language of FACT_LANGUAGES) {
    const count = files.filter((file) => file.language === language).length;
    if (count > 0) languages[language] = count;
  }
  const stacks: Facts['stacks'] = [];
  if (js.hasPackageJson || (languages.typescript ?? 0) + (languages.javascript ?? 0) > 0) stacks.push('js');
  if (files.some((file) => file.language === 'python')) stacks.push('python');
  const modules = files.filter(isModule);
  const facts: Facts = {
    languages,
    stacks,
    frameworks: [...js.frameworks],
    domains: [],
    commands: { ...js.commands },
    sourceFiles: files.filter((file) => isCodePath(file.path)).length,
    modules: modules.length,
    modulesWithTests: modules.filter((file) => tests.testedModules.has(file.path)).length,
    testCasesTotal: tests.testCasesTotal,
    testCasesByModule: sortedRecord(tests.testCasesByModule),
    codeLines: input.measure.codeLines,
    fileLines: sortedRecord(input.measure.fileLines),
    botHandlers: input.botHandlers,
    hotspots: [...input.hotspots],
  };
  if (tests.coverage !== undefined) facts.coverage = tests.coverage;
  return facts;
}

/** Same record with keys in code-point order, so the snapshot JSON does not depend on build order. */
function sortedRecord(record: Record<string, number>): Record<string, number> {
  const sorted: Record<string, number> = {};
  for (const key of Object.keys(record).sort()) sorted[key] = record[key] ?? 0;
  return sorted;
}
```

`src/analyzer/rules/todo.ts`:

```ts
import type { Language } from '../files.js';
import { lineKey } from '../findings.js';
import { matchLines } from './text.js';
import type { Rule, RuleHit } from './types.js';

const TODO_LANGUAGES: ReadonlySet<Language> = new Set(['typescript', 'javascript', 'python', 'html', 'css']);
const TODO_PATTERN = /(?:\/\/|\/\*|^\s*\*|#|<!--)\s*(?:.*?\s)?(TODO|FIXME|HACK|XXX)\b[:\s-]*(.*)$/;
// `*/` or `-->` closing the comment on the same line is not part of the note.
const COMMENT_END = /\s*(?:\*\/|-->)\s*$/;

export const todoRule: Rule = {
  id: 'generic/todo',
  category: 'clean-code',
  severity: 'low',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (file.content === null || !TODO_LANGUAGES.has(file.language)) continue;
      for (const { line, match } of matchLines(file, TODO_PATTERN)) {
        const marker = match[1] ?? '';
        const text = (match[2] ?? '').replace(COMMENT_END, '').trim();
        hits.push({
          file: file.path,
          line,
          message: text ? `${marker}: ${text}` : marker,
          key: `${marker}:${lineKey(text).toLowerCase()}`,
        });
      }
    }
    return hits;
  },
};
```

`src/analyzer/rules/index.ts`:

```ts
import { todoRule } from './todo.js';
import type { Rule } from './types.js';

/** Rules run in this order; each task appends its rules. */
export const RULES: readonly Rule[] = [todoRule];
```

`src/analyzer/analyze.ts`:

```ts
import type { Finding, Snapshot } from '../types.js';
import type { AnalysisContext } from './context.js';
import { findEntryPoints } from './entry-points.js';
import { buildFacts } from './facts.js';
import { listFiles, loadFiles, type SourceFile } from './files.js';
import { toFindings } from './findings.js';
import { computeChangeKey, readHead, readHotspots } from './history.js';
import { buildImportGraph, GRAPH_LANGUAGES } from './import-graph.js';
import { readJsProject } from './js-project.js';
import { countBotHandlers, measureLines } from './metrics.js';
import { RULES } from './rules/index.js';
import type { Rule } from './rules/types.js';
import { collectTestFacts, readCoverage } from './test-facts.js';

export interface AnalyzeOptions {
  now: Date;
  /** Defaults to RULES; tests pass a single rule. */
  rules?: readonly Rule[];
}

export interface ContextInput {
  root: string;
  files: SourceFile[];
  isGitRepo: boolean;
  tracked: Set<string>;
  /** Already filtered to listed files. */
  hotspots?: string[];
  coverage?: number;
}

export async function analyzeProject(root: string, options: AnalyzeOptions): Promise<Snapshot> {
  const listing = await listFiles(root);
  const head = listing.isGitRepo ? await readHead(root) : null;
  const changeKey = computeChangeKey(head, listing.files);
  const files = await loadFiles(root, listing.files);
  const coverage = await readCoverage(root);
  const listed = new Set(listing.files.map((file) => file.path));
  // History can name deleted or ignored files; only files that exist now are hot.
  const hotspots = listing.isGitRepo ? (await readHotspots(root)).filter((file) => listed.has(file)) : [];
  const ctx = buildContext({ root, files, isGitRepo: listing.isGitRepo, tracked: listing.tracked, hotspots, coverage });

  const findings: Finding[] = [];
  const errors: Snapshot['errors'] = [];
  for (const rule of options.rules ?? RULES) {
    try {
      findings.push(...toFindings(rule, rule.run(ctx)));
    } catch (error) {
      // One broken rule must not cost the whole snapshot (spec §3.6).
      errors.push({ rule: rule.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  findings.sort(compareFindings);
  return { schema: 1, takenAt: options.now.toISOString(), changeKey, head, facts: ctx.facts, findings, errors };
}

/** Pure part of the analysis: no disk, no git. Unit tests of rules call it with in-memory files. */
export function buildContext(input: ContextInput): AnalysisContext {
  const { files } = input;
  const byPath = new Map(files.map((file) => [file.path, file]));
  const js = readJsProject(byPath);
  const graph = buildImportGraph(files, js.aliasBase);
  const entryPoints = findEntryPoints(files, js);
  const tests = collectTestFacts(files, graph);
  if (input.coverage !== undefined) tests.coverage = input.coverage;
  const facts = buildFacts({
    files,
    js,
    tests,
    measure: measureLines(files),
    botHandlers: countBotHandlers(files),
    hotspots: input.hotspots ?? [],
  });
  return {
    root: input.root,
    files,
    byPath,
    isGitRepo: input.isGitRepo,
    tracked: input.tracked,
    js,
    graph,
    graphLanguages: GRAPH_LANGUAGES,
    entryPoints,
    tests,
    facts,
  };
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** File ('' first), line (0 when absent), rule, id — code-point order, independent of locale. */
function compareFindings(a: Finding, b: Finding): number {
  return (
    compareText(a.file ?? '', b.file ?? '') ||
    (a.line ?? 0) - (b.line ?? 0) ||
    compareText(a.rule, b.rule) ||
    compareText(a.id, b.id)
  );
}
```

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `npx vitest run tests/analyzer`
Expected: PASS — `findings.test.ts` 4, `rule-text.test.ts` 10, `facts.test.ts` 2, `analyze.test.ts` 5,
`todo.test.ts` 2, `fixture-harness.test.ts` 2, `rule-fixtures.test.ts` 3; тесты задач 1–5 зелёные.

Run: `npm run lint`
Expected: без ошибок, в выводе нет файлов из `tests/fixtures` (проверка формы исключения из Task 1, Step 1).

- [ ] **Step 6: Commit**

```powershell
npm run format
npm run check
git add src/analyzer tests/analyzer tests/helpers tests/fixtures
git commit -m "feat(analyzer): rule framework, analyzeProject and generic/todo" -m "Co-Authored-By: <model> <noreply@anthropic.com>"
```

Expected от `npm run check`: без ошибок, все тесты зелёные.

---

### Task 7: Текстовые правила — подавления, пропущенные тесты, пустой catch, большие файлы, `eval`, `console.log`

**Files:**
- Create: `src/analyzer/rules/suppression.ts`, `src/analyzer/rules/skipped-test.ts`,
  `src/analyzer/rules/empty-catch.ts`, `src/analyzer/rules/large-file.ts`, `src/analyzer/rules/js-eval.ts`,
  `src/analyzer/rules/js-debug-log.ts`, `tests/analyzer/text-rules.test.ts`
- Create: `tests/fixtures/rules/{generic.suppression,generic.skipped-test,generic.empty-catch,generic.large-file,js.eval,js.debug-log}/{bad,good}/…`
- Modify: `src/analyzer/rules/index.ts`

**Interfaces:**
- Consumes: `Rule`, `RuleHit`, `lineKey`, `matchLines`, `matchContent`, `isCommentLine`, `JS_LANGUAGES`, `FileKind`,
  `Language` (Task 1, Task 6); `runRule`, `copyFixture` (Task 6).
- Produces: `suppressionRule` (`generic/suppression`), `skippedTestRule` (`generic/skipped-test`), `emptyCatchRule`
  (`generic/empty-catch`), `largeFileRule` (`generic/large-file`), `jsEvalRule` (`js/eval`), `jsDebugLogRule`
  (`js/debug-log`); `RULES` дополнен ими в этом порядке.

- [ ] **Step 1: Написать фикстуры**

`tests/fixtures/rules/generic.suppression/bad/src/app.ts`:

```ts
// @ts-ignore
export const port: number = process.env.PORT;
```

`tests/fixtures/rules/generic.suppression/bad/src/tool.py`:

```python
import os  # noqa: F401
```

`tests/fixtures/rules/generic.suppression/good/src/app.ts`:

```ts
export const port: number = Number(process.env.PORT ?? '3000');
```

`tests/fixtures/rules/generic.suppression/good/src/tool.py`:

```python
import os

print(os.getcwd())
```

`tests/fixtures/rules/generic.skipped-test/bad/src/sum.test.ts`:

```ts
import { expect, it } from 'vitest';
import { sum } from './sum.js';

it('adds numbers', () => {
  expect(sum(1, 2)).toBe(3);
});

it.skip('handles negative numbers', () => {
  expect(sum(-1, -2)).toBe(-3);
});
```

`tests/fixtures/rules/generic.skipped-test/good/src/sum.test.ts`:

```ts
import { expect, it } from 'vitest';
import { sum } from './sum.js';

it('adds numbers', () => {
  expect(sum(1, 2)).toBe(3);
});

it('handles negative numbers', () => {
  expect(sum(-1, -2)).toBe(-3);
});
```

`tests/fixtures/rules/generic.empty-catch/bad/src/load.ts`:

```ts
import { readFileSync } from 'node:fs';

export function loadConfig(file: string): string {
  let text = '{}';
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {}
  return text;
}
```

`tests/fixtures/rules/generic.empty-catch/bad/src/load.py`:

```python
def load_config(path):
    try:
        return open(path).read()
    except OSError:
        pass
```

`tests/fixtures/rules/generic.empty-catch/good/src/load.ts`:

```ts
import { readFileSync } from 'node:fs';

export function loadConfig(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read ${file}: ${String(error)}`);
  }
}
```

`tests/fixtures/rules/generic.empty-catch/good/src/load.py`:

```python
import logging


def load_config(path):
    try:
        return open(path).read()
    except OSError:
        logging.exception("cannot read %s", path)
        return "{}"
```

`tests/fixtures/rules/generic.large-file/bad/src/big.ts` — 410 строк, создаётся командой (из корня репозитория):

```powershell
node -e "const fs = require('node:fs'); const dir = 'tests/fixtures/rules/generic.large-file/bad/src'; fs.mkdirSync(dir, { recursive: true }); const body = Array.from({ length: 410 }, (_, i) => 'export const value' + i + ' = ' + i + ';').join('\n'); fs.writeFileSync(dir + '/big.ts', body + '\n');"
(Get-Content tests/fixtures/rules/generic.large-file/bad/src/big.ts).Count
```

Expected: `410`; первая строка файла `export const value0 = 0;`, последняя `export const value409 = 409;`.

`tests/fixtures/rules/generic.large-file/good/src/small.ts`:

```ts
export const value0 = 0;
export const value1 = 1;
export const value2 = 2;
```

`tests/fixtures/rules/js.eval/bad/src/calc.ts`:

```ts
export function calculate(expression: string): unknown {
  return eval(expression);
}
```

`tests/fixtures/rules/js.eval/good/src/calc.ts`:

```ts
// eval(expression) was removed: parse numbers explicitly instead.
export function calculate(expression: string): number {
  return Number.parseFloat(expression);
}
```

`tests/fixtures/rules/js.debug-log/bad/src/server.ts`:

```ts
export function start(port: number): void {
  console.log('listening on', port);
}
```

`tests/fixtures/rules/js.debug-log/good/src/server.ts`:

```ts
export function start(port: number, onReady: (port: number) => void): void {
  onReady(port);
}
```

`tests/fixtures/rules/js.debug-log/good/scripts/seed.ts` (скрипты печатают в консоль законно):

```ts
console.log('seeding the database');
```

- [ ] **Step 2: Написать падающие unit-тесты**

`tests/analyzer/text-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lineKey } from '../../src/analyzer/findings.js';
import { emptyCatchRule } from '../../src/analyzer/rules/empty-catch.js';
import { jsDebugLogRule } from '../../src/analyzer/rules/js-debug-log.js';
import { jsEvalRule } from '../../src/analyzer/rules/js-eval.js';
import { largeFileRule } from '../../src/analyzer/rules/large-file.js';
import { skippedTestRule } from '../../src/analyzer/rules/skipped-test.js';
import { suppressionRule } from '../../src/analyzer/rules/suppression.js';
import { runRule } from '../helpers/rule-context.js';

describe('generic/suppression', () => {
  it.each([
    ['ts-ignore', 'src/a.ts', '// @ts-ignore'],
    ['ts-nocheck', 'src/a.ts', '// @ts-nocheck'],
    ['eslint-disable', 'src/a.ts', '/* eslint-disable no-console */'],
    ['noqa', 'app.py', 'import os  # noqa: F401'],
    ['type-ignore', 'app.py', 'x: int = "a"  # type: ignore'],
    ['istanbul', 'src/a.ts', '/* istanbul ignore next */'],
    ['no-cover', 'app.py', 'if DEBUG:  # pragma: no cover'],
  ] as const)('finds %s', (name, file, line) => {
    expect(runRule(suppressionRule, { [file]: `${line}\n` })).toEqual([
      { file, line: 1, message: `Suppression comment hides a problem: ${name}`, key: `${name}:${lineKey(line)}` },
    ]);
  });

  it('ignores documentation and other non-code files', () => {
    expect(runRule(suppressionRule, { 'README.md': 'Avoid // @ts-ignore\n' })).toEqual([]);
  });
});

describe('generic/skipped-test', () => {
  it.each([
    ['src/a.test.ts', "it.skip('a', () => {});"],
    ['src/a.test.ts', "  xit('a', () => {});"],
    ['src/a.spec.js', "describe.skip('suite', () => {});"],
    ['src/a.test.ts', "xtest('a', () => {});"],
    ['tests/test_a.py', '@pytest.mark.skip(reason="flaky")'],
    ['tests/test_a.py', '@unittest.skip("later")'],
  ] as const)('finds a skip in %s: %s', (file, line) => {
    expect(runRule(skippedTestRule, { [file]: `${line}\n` })).toEqual([
      { file, line: 1, message: `Skipped test: ${lineKey(line)}`, key: lineKey(line) },
    ]);
  });

  it('looks only at test files and real calls', () => {
    const hits = runRule(skippedTestRule, {
      'src/a.ts': "it.skip('a', () => {});\n",
      'src/b.test.ts': "it('a', () => { process.exit(0); });\nconst box = maxit(1);\n// it.skip('old')\n",
    });
    expect(hits).toEqual([]);
  });
});

describe('generic/empty-catch', () => {
  it('reports the catch line in a CRLF file', () => {
    const content = 'export function f(): void {\r\n  try {\r\n    run();\r\n  } catch (error) {\r\n  }\r\n}\r\n';
    expect(runRule(emptyCatchRule, { 'src/a.ts': content })).toEqual([
      { file: 'src/a.ts', line: 4, message: 'Empty catch block swallows the error', key: '} catch (error) {' },
    ]);
  });

  it('finds except … pass in a CRLF Python file', () => {
    const content = 'try:\r\n    run()\r\nexcept ValueError:\r\n    pass\r\n';
    expect(runRule(emptyCatchRule, { 'app.py': content })).toEqual([
      { file: 'app.py', line: 3, message: 'Exception silenced with pass', key: 'except ValueError:' },
    ]);
  });

  it('ignores handlers that do something and promise .catch callbacks', () => {
    const hits = runRule(emptyCatchRule, {
      'src/a.ts': 'try { run(); } catch (error) { log(error); }\npromise.catch(() => {});\n',
      'app.py': 'try:\n    run()\nexcept ValueError:\n    log()\n',
    });
    expect(hits).toEqual([]);
  });
});

describe('generic/large-file', () => {
  it('flags code and test files over 400 lines: medium, over 800: high', () => {
    const lines = (count: number): string => 'x\n'.repeat(count);
    const hits = runRule(largeFileRule, {
      'src/ok.ts': lines(400),
      'src/big.ts': lines(401),
      'src/huge.test.ts': lines(801),
      'data.json': lines(900),
    });
    expect(hits).toEqual([
      { file: 'src/big.ts', message: 'File has 401 lines (limit 400)', key: 'size', severity: 'medium' },
      { file: 'src/huge.test.ts', message: 'File has 801 lines (limit 400)', key: 'size', severity: 'high' },
    ]);
  });
});

describe('js/eval', () => {
  it('flags eval and new Function in code and config files', () => {
    const hits = runRule(jsEvalRule, {
      'src/a.ts': 'const f = new Function("a", "return a");\n',
      'vite.config.js': 'eval(source);\n',
    });
    expect(hits).toEqual([
      {
        file: 'src/a.ts',
        line: 1,
        message: 'Dynamic code execution: const f = new Function("a", "return a");',
        key: 'const f = new Function("a", "return a");',
      },
      { file: 'vite.config.js', line: 1, message: 'Dynamic code execution: eval(source);', key: 'eval(source);' },
    ]);
  });

  it('skips comments, method calls, tests and non-JS files', () => {
    const hits = runRule(jsEvalRule, {
      'src/a.ts': '// eval(x) is banned\nconst r = sandbox.eval(code);\nconst evaluate = 1;\n',
      'src/a.test.ts': 'eval(x);\n',
      'app.py': 'eval(x)\n',
    });
    expect(hits).toEqual([]);
  });
});

describe('js/debug-log', () => {
  it('flags console.log in code', () => {
    expect(runRule(jsDebugLogRule, { 'src/server.ts': 'console.log("started");\n' })).toEqual([
      { file: 'src/server.ts', line: 1, message: 'console.log left in code', key: 'console.log("started");' },
    ]);
  });

  it('skips scripts, bin, tests, comments and other console methods', () => {
    const hits = runRule(jsDebugLogRule, {
      'scripts/seed.ts': 'console.log(1);\n',
      'bin/cli.js': 'console.log(1);\n',
      'src/a.test.ts': 'console.log(1);\n',
      'src/b.ts': '// console.log(1);\nconsole.error(1);\n',
    });
    expect(hits).toEqual([]);
  });
});
```

- [ ] **Step 3: Убедиться, что тесты падают**

Run: `npx vitest run tests/analyzer/text-rules.test.ts tests/analyzer/rule-fixtures.test.ts`
Expected: FAIL — не найдены модули `src/analyzer/rules/suppression.js` и др.; в `rule-fixtures.test.ts` падают
«every rule has a fixture folder…» (шесть папок без правил) и тесты `bad`/`good` новых папок («no rule with id …»).

- [ ] **Step 4: Реализовать**

`src/analyzer/rules/suppression.ts`:

```ts
import type { FileKind } from '../files.js';
import { lineKey } from '../findings.js';
import { matchLines } from './text.js';
import type { Rule, RuleHit } from './types.js';

const SUPPRESSION_KINDS: ReadonlySet<FileKind> = new Set(['code', 'test', 'config']);

const SUPPRESSIONS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'ts-ignore', pattern: /@ts-ignore/ },
  { name: 'ts-nocheck', pattern: /@ts-nocheck/ },
  { name: 'eslint-disable', pattern: /eslint-disable/ },
  { name: 'noqa', pattern: /#\s*noqa/ },
  { name: 'type-ignore', pattern: /#\s*type:\s*ignore/ },
  { name: 'istanbul', pattern: /istanbul ignore/ },
  { name: 'no-cover', pattern: /pragma:\s*no cover/ },
];

export const suppressionRule: Rule = {
  id: 'generic/suppression',
  category: 'clean-code',
  severity: 'low',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (file.content === null || !SUPPRESSION_KINDS.has(file.kind)) continue;
      for (const { name, pattern } of SUPPRESSIONS) {
        for (const { line, text } of matchLines(file, pattern)) {
          hits.push({
            file: file.path,
            line,
            message: `Suppression comment hides a problem: ${name}`,
            key: `${name}:${lineKey(text)}`,
          });
        }
      }
    }
    return hits;
  },
};
```

`src/analyzer/rules/skipped-test.ts`:

```ts
import { lineKey } from '../findings.js';
import { isCommentLine } from './text.js';
import type { Rule, RuleHit } from './types.js';

const SKIP_PATTERNS: readonly RegExp[] = [
  /\b(?:it|test|describe)\.skip\s*\(/,
  // xit( / xtest( / xdescribe( — but not maxit( or obj.xit(
  /(?<![\w.$])x(?:it|test|describe)\s*\(/,
  /@pytest\.mark\.skip/,
  /@unittest\.skip/,
];

export const skippedTestRule: Rule = {
  id: 'generic/skipped-test',
  category: 'testing',
  severity: 'low',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (file.kind !== 'test' || file.content === null) continue;
      for (const [index, text] of file.lines.entries()) {
        if (isCommentLine(text) || !SKIP_PATTERNS.some((pattern) => pattern.test(text))) continue;
        hits.push({ file: file.path, line: index + 1, message: `Skipped test: ${lineKey(text)}`, key: lineKey(text) });
      }
    }
    return hits;
  },
};
```

`src/analyzer/rules/empty-catch.ts`:

```ts
import type { Language } from '../files.js';
import { lineKey } from '../findings.js';
import { JS_LANGUAGES, matchContent } from './text.js';
import type { Rule, RuleHit } from './types.js';

// Content-wide patterns: the empty body may sit on the next line.
const JS_EMPTY_CATCH = /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
const PY_EMPTY_EXCEPT = /\bexcept\b[^\n:]*:[ \t]*(?:\r?\n[ \t]*)?pass\b/g;

function checkFor(language: Language): { pattern: RegExp; message: string } | null {
  if (JS_LANGUAGES.has(language)) return { pattern: JS_EMPTY_CATCH, message: 'Empty catch block swallows the error' };
  if (language === 'python') return { pattern: PY_EMPTY_EXCEPT, message: 'Exception silenced with pass' };
  return null;
}

export const emptyCatchRule: Rule = {
  id: 'generic/empty-catch',
  category: 'reliability',
  severity: 'medium',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      const check = checkFor(file.language);
      if (check === null) continue;
      for (const { line } of matchContent(file, check.pattern)) {
        hits.push({ file: file.path, line, message: check.message, key: lineKey(file.lines[line - 1] ?? '') });
      }
    }
    return hits;
  },
};
```

`src/analyzer/rules/large-file.ts`:

```ts
import type { Rule, RuleHit } from './types.js';

const LIMIT = 400;
const HIGH_LIMIT = 800;

export const largeFileRule: Rule = {
  id: 'generic/large-file',
  category: 'architecture',
  severity: 'medium',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if ((file.kind !== 'code' && file.kind !== 'test') || file.content === null) continue;
      const count = file.lines.length;
      if (count <= LIMIT) continue;
      hits.push({
        file: file.path,
        message: `File has ${count} lines (limit ${LIMIT})`,
        // One finding per file: growing from 450 to 500 lines is the same problem, not a new one.
        key: 'size',
        severity: count > HIGH_LIMIT ? 'high' : 'medium',
      });
    }
    return hits;
  },
};
```

`src/analyzer/rules/js-eval.ts`:

```ts
import type { FileKind } from '../files.js';
import { lineKey } from '../findings.js';
import { isCommentLine, JS_LANGUAGES, matchLines } from './text.js';
import type { Rule, RuleHit } from './types.js';

const EVAL_KINDS: ReadonlySet<FileKind> = new Set(['code', 'config']);
// Plain eval( but not sandbox.eval( or myeval(.
const EVAL_PATTERN = /(?<![\w.$])eval\s*\(|\bnew\s+Function\s*\(/;

export const jsEvalRule: Rule = {
  id: 'js/eval',
  category: 'security',
  severity: 'high',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (!JS_LANGUAGES.has(file.language) || !EVAL_KINDS.has(file.kind)) continue;
      for (const { line, text } of matchLines(file, EVAL_PATTERN)) {
        if (isCommentLine(text)) continue;
        hits.push({ file: file.path, line, message: `Dynamic code execution: ${lineKey(text)}`, key: lineKey(text) });
      }
    }
    return hits;
  },
};
```

`src/analyzer/rules/js-debug-log.ts`:

```ts
import { lineKey } from '../findings.js';
import { isCommentLine, JS_LANGUAGES, matchLines } from './text.js';
import type { Rule, RuleHit } from './types.js';

// CLI entry points and one-off scripts print to the console on purpose.
const SKIPPED_FOLDERS: ReadonlySet<string> = new Set(['scripts', 'bin']);
const LOG_PATTERN = /\bconsole\.log\s*\(/;

function inSkippedFolder(filePath: string): boolean {
  return filePath
    .split('/')
    .slice(0, -1)
    .some((folder) => SKIPPED_FOLDERS.has(folder));
}

export const jsDebugLogRule: Rule = {
  id: 'js/debug-log',
  category: 'clean-code',
  severity: 'low',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (!JS_LANGUAGES.has(file.language) || file.kind !== 'code' || inSkippedFolder(file.path)) continue;
      for (const { line, text } of matchLines(file, LOG_PATTERN)) {
        if (isCommentLine(text)) continue;
        hits.push({ file: file.path, line, message: 'console.log left in code', key: lineKey(text) });
      }
    }
    return hits;
  },
};
```

`src/analyzer/rules/index.ts` — полностью:

```ts
import { emptyCatchRule } from './empty-catch.js';
import { jsDebugLogRule } from './js-debug-log.js';
import { jsEvalRule } from './js-eval.js';
import { largeFileRule } from './large-file.js';
import { skippedTestRule } from './skipped-test.js';
import { suppressionRule } from './suppression.js';
import { todoRule } from './todo.js';
import type { Rule } from './types.js';

/** Rules run in this order; each task appends its rules. */
export const RULES: readonly Rule[] = [
  todoRule,
  suppressionRule,
  skippedTestRule,
  emptyCatchRule,
  largeFileRule,
  jsEvalRule,
  jsDebugLogRule,
];
```

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `npx vitest run tests/analyzer`
Expected: PASS — `text-rules.test.ts` 23, `rule-fixtures.test.ts` 15 (1 + 2 × 7 правил); остальные тесты зелёные.

- [ ] **Step 6: Commit**

```powershell
npm run format
npm run check
git add src/analyzer/rules tests/analyzer/text-rules.test.ts tests/fixtures/rules
git commit -m "feat(analyzer): text rules (suppression, skipped tests, empty catch, large file, eval, console.log)" -m "Co-Authored-By: <model> <noreply@anthropic.com>"
```

Expected от `npm run check`: без ошибок, все тесты зелёные.

---

### Task 8: Правила уровня проекта — README, `.env.example`, lock-файл, `.env` в git, секреты в коде

**Files:**
- Create: `src/analyzer/rules/no-readme.ts`, `src/analyzer/rules/no-env-example.ts`,
  `src/analyzer/rules/no-lockfile.ts`, `src/analyzer/rules/env-tracked.ts`, `src/analyzer/rules/hardcoded-secret.ts`,
  `tests/analyzer/project-rules.test.ts`, `tests/analyzer/hardcoded-secret.test.ts`
- Create: `tests/fixtures/rules/{generic.no-readme,generic.no-env-example,generic.no-lockfile,generic.env-tracked,generic.hardcoded-secret}/{bad,good}/…`
- Modify: `src/analyzer/rules/index.ts`

**Interfaces:**
- Consumes: `Rule`, `RuleHit`, `matchContent`, `Severity` (Task 6, `src/types.ts`); `runRule`, `copyFixture`,
  `FAKE_SECRETS` (Task 6).
- Produces: `noReadmeRule` (`generic/no-readme`), `noEnvExampleRule` (`generic/no-env-example`), `noLockfileRule`
  (`generic/no-lockfile`) и `LOCK_FILES: readonly string[]`, `envTrackedRule` (`generic/env-tracked`),
  `hardcodedSecretRule` (`generic/hardcoded-secret`); `RULES` дополнен ими в этом порядке.

Секреты в фикстурах — только плейсхолдеры `__FAKE_<ИМЯ>__`: `copyFixture` подставляет фальшивые значения из
`FAKE_SECRETS` уже во временной папке. `.env`-файлы в фикстурах называются `_env`.

- [ ] **Step 1: Написать фикстуры**

`tests/fixtures/rules/generic.no-readme/bad/README.md`:

```md
# Shop

TODO: write docs
```

`tests/fixtures/rules/generic.no-readme/good/README.md`:

```md
# Shop

Small online shop on Next.js with Stripe payments.

## Setup

1. Install dependencies: `npm install`.
2. Copy `.env.example` to `.env` and fill in the keys.
3. Start the dev server: `npm run dev`.

## Tests

Run `npm test` before every commit.

## Deploy

Pushes to `main` deploy automatically.
```

`tests/fixtures/rules/generic.no-env-example/bad/src/config.ts`:

```ts
export const port = Number(process.env.PORT ?? '3000');
```

`tests/fixtures/rules/generic.no-env-example/good/src/config.ts`:

```ts
export const port = Number(process.env.PORT ?? '3000');
```

`tests/fixtures/rules/generic.no-env-example/good/_env.example`:

```text
PORT=3000
```

`tests/fixtures/rules/generic.no-lockfile/bad/package.json`:

```json
{
  "name": "demo",
  "version": "1.0.0",
  "private": true
}
```

`tests/fixtures/rules/generic.no-lockfile/good/package.json`:

```json
{
  "name": "demo",
  "version": "1.0.0",
  "private": true
}
```

`tests/fixtures/rules/generic.no-lockfile/good/package-lock.json`:

```json
{
  "name": "demo",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "demo",
      "version": "1.0.0"
    }
  }
}
```

`tests/fixtures/rules/generic.env-tracked/bad/_env` (в bad-копии `.env` коммитится — `.gitignore` нет):

```text
API_URL=http://localhost:3000
```

`tests/fixtures/rules/generic.env-tracked/good/_env`:

```text
API_URL=http://localhost:3000
```

`tests/fixtures/rules/generic.env-tracked/good/_gitignore`:

```text
.env
node_modules/
```

`tests/fixtures/rules/generic.hardcoded-secret/bad/src/config.ts`:

```ts
export const stripeKey = '__FAKE_STRIPE_LIVE__';
export const botToken = '__FAKE_TELEGRAM__';
```

`tests/fixtures/rules/generic.hardcoded-secret/good/src/config.ts`:

```ts
export const stripeKey = process.env.STRIPE_SECRET_KEY ?? '';
export const botToken = process.env.BOT_TOKEN ?? '';
```

`tests/fixtures/rules/generic.hardcoded-secret/good/_env` (секрет в `.env` — дело `generic/env-tracked`, это
правило его не ищет):

```text
BOT_TOKEN=__FAKE_TELEGRAM__
```

- [ ] **Step 2: Написать падающие unit-тесты**

`tests/analyzer/project-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { envTrackedRule } from '../../src/analyzer/rules/env-tracked.js';
import { noEnvExampleRule } from '../../src/analyzer/rules/no-env-example.js';
import { noLockfileRule } from '../../src/analyzer/rules/no-lockfile.js';
import { noReadmeRule } from '../../src/analyzer/rules/no-readme.js';
import { runRule } from '../helpers/rule-context.js';

const tenLines = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');

describe('generic/no-readme', () => {
  it('reports a missing root README without a file', () => {
    expect(runRule(noReadmeRule, { 'docs/README.md': tenLines, 'src/a.ts': 'x\n' })).toEqual([
      { message: 'Project has no README', key: '' },
    ]);
  });

  it('reports a short README with its path', () => {
    expect(runRule(noReadmeRule, { 'readme.txt': '# App\n\nshort\n' })).toEqual([
      { file: 'readme.txt', message: 'README has only 2 non-empty lines (need 10+)', key: '' },
    ]);
  });

  it('accepts a README with 10 non-empty lines', () => {
    expect(runRule(noReadmeRule, { 'README.md': tenLines })).toEqual([]);
  });
});

describe('generic/no-env-example', () => {
  it('reports env reads without an example file', () => {
    const hits = runRule(noEnvExampleRule, {
      'src/config.ts': 'export const port = process.env.PORT;\n',
      'bot.py': 'import os\ntoken = os.getenv("BOT_TOKEN")\n',
    });
    expect(hits).toEqual([
      { message: 'Code reads environment variables (bot.py and 1 more) but there is no .env.example', key: '' },
    ]);
  });

  it.each(['.env.example', '.env.sample', '.env.template'])('is satisfied by %s', (name) => {
    expect(runRule(noEnvExampleRule, { 'src/config.ts': 'process.env.PORT;\n', [name]: 'PORT=\n' })).toEqual([]);
  });

  it('stays silent when code does not read the environment', () => {
    expect(runRule(noEnvExampleRule, { 'src/a.ts': 'export const env = "production";\n' })).toEqual([]);
  });
});

describe('generic/no-lockfile', () => {
  it('reports package.json without a lock file', () => {
    expect(runRule(noLockfileRule, { 'package.json': '{}' })).toEqual([
      { file: 'package.json', message: 'package.json has no lock file, so installs are not reproducible', key: '' },
    ]);
  });

  it('accepts any known lock file and projects without package.json', () => {
    expect(runRule(noLockfileRule, { 'package.json': '{}', 'yarn.lock': '' })).toEqual([]);
    expect(runRule(noLockfileRule, { 'index.html': '<p></p>\n' })).toEqual([]);
  });
});

describe('generic/env-tracked', () => {
  it('reports a .env committed to git', () => {
    expect(runRule(envTrackedRule, { '.env': 'A=1\n' }, { tracked: ['.env'] })).toEqual([
      { file: '.env', message: '.env is committed to git', key: '.env' },
    ]);
  });

  it('reports an untracked .env that git does not ignore', () => {
    expect(runRule(envTrackedRule, { 'apps/api/.env': 'A=1\n' }, { tracked: [] })).toEqual([
      { file: 'apps/api/.env', message: 'apps/api/.env is not ignored by git', key: 'apps/api/.env' },
    ]);
  });

  it('outside git checks the root .gitignore', () => {
    expect(runRule(envTrackedRule, { '.env': 'A=1\n' })).toEqual([
      { file: '.env', message: '.env is not listed in .gitignore', key: '.env' },
    ]);
    expect(runRule(envTrackedRule, { '.env': 'A=1\n', '.gitignore': 'node_modules/\n.env*\n' })).toEqual([]);
    // "/.env" covers only the root file, not a nested one.
    expect(runRule(envTrackedRule, { 'apps/api/.env': 'A=1\n', '.gitignore': '/.env\n' })).toEqual([
      { file: 'apps/api/.env', message: 'apps/api/.env is not listed in .gitignore', key: 'apps/api/.env' },
    ]);
  });
});
```

`tests/analyzer/hardcoded-secret.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hardcodedSecretRule } from '../../src/analyzer/rules/hardcoded-secret.js';
import { FAKE_SECRETS } from '../helpers/fixtures.js';
import { runRule } from '../helpers/rule-context.js';

const hashOf = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 16);
// Built at runtime so this test file itself does not contain a password-looking assignment.
const PASSWORD = ['correct', 'horse', 'battery', 'staple'].join('-');

describe('generic/hardcoded-secret', () => {
  it.each([
    ['aws', 'critical', `const key = '${FAKE_SECRETS.AWS}';`, FAKE_SECRETS.AWS],
    ['stripe', 'critical', `const key = '${FAKE_SECRETS.STRIPE_LIVE}';`, FAKE_SECRETS.STRIPE_LIVE],
    ['stripe-test', 'high', `const key = '${FAKE_SECRETS.STRIPE_TEST}';`, FAKE_SECRETS.STRIPE_TEST],
    ['telegram', 'critical', `const token = '${FAKE_SECRETS.TELEGRAM}';`, FAKE_SECRETS.TELEGRAM],
    ['github', 'critical', `const token = '${FAKE_SECRETS.GITHUB}';`, FAKE_SECRETS.GITHUB],
    ['private-key', 'critical', `const pem = '${FAKE_SECRETS.PRIVATE_KEY}';`, FAKE_SECRETS.PRIVATE_KEY],
    ['assignment', 'high', `const password = '${PASSWORD}';`, PASSWORD],
  ])('finds a %s secret with severity %s', (type, severity, line, value) => {
    const hits = runRule(hardcodedSecretRule, { 'src/config.ts': `// settings\n${line}\n` });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ file: 'src/config.ts', line: 2, severity, key: `${type}:${hashOf(value)}` });
  });

  it('masks the value in the message and never keeps it whole', () => {
    const value = FAKE_SECRETS.STRIPE_LIVE;
    const [hit] = runRule(hardcodedSecretRule, { 'src/pay.ts': `export const key = '${value}';\n` });
    expect(hit?.message).toBe(`Hardcoded Stripe live key: ${value.slice(0, 8)}…${value.slice(-4)}`);
    expect(JSON.stringify(hit)).not.toContain(value);
  });

  it('reports a known key inside a secret assignment once, as the specific type', () => {
    const hits = runRule(hardcodedSecretRule, { 'src/pay.ts': `const sec${'ret'} = '${FAKE_SECRETS.STRIPE_LIVE}';\n` });
    expect(hits.map((hit) => hit.key)).toEqual([`stripe:${hashOf(FAKE_SECRETS.STRIPE_LIVE)}`]);
  });

  it('skips .env files and lock files', () => {
    const token = FAKE_SECRETS.TELEGRAM;
    const hits = runRule(hardcodedSecretRule, {
      '.env': `BOT_TOKEN=${token}\n`,
      'apps/bot/.env.local': `BOT_TOKEN=${token}\n`,
      'package-lock.json': `{ "token": "${token}" }\n`,
      'yarn.lock': `token "${token}"\n`,
    });
    expect(hits).toEqual([]);
  });

  it('gives the same value the same key in different files', () => {
    const hits = runRule(hardcodedSecretRule, {
      'a.ts': `const k = '${FAKE_SECRETS.AWS}';\n`,
      'b.py': `K = "${FAKE_SECRETS.AWS}"\n`,
    });
    const key = `aws:${hashOf(FAKE_SECRETS.AWS)}`;
    expect(hits.map((hit) => [hit.file, hit.key])).toEqual([
      ['a.ts', key],
      ['b.py', key],
    ]);
  });
});
```

- [ ] **Step 3: Убедиться, что тесты падают**

Run: `npx vitest run tests/analyzer/project-rules.test.ts tests/analyzer/hardcoded-secret.test.ts tests/analyzer/rule-fixtures.test.ts`
Expected: FAIL — не найдены модули `src/analyzer/rules/no-readme.js` и др.; в `rule-fixtures.test.ts` падают
«every rule has a fixture folder…» (пять папок без правил) и тесты `bad`/`good` новых папок.

- [ ] **Step 4: Реализовать**

`src/analyzer/rules/no-readme.ts`:

```ts
import type { Rule } from './types.js';

const README = /^readme(\.\w+)?$/i;
const MIN_LINES = 10;

export const noReadmeRule: Rule = {
  id: 'generic/no-readme',
  category: 'maintainability',
  severity: 'low',
  run(ctx) {
    // Only the root README describes the project; docs/README.md does not count.
    const readme = ctx.files.find((file) => !file.path.includes('/') && README.test(file.path));
    if (!readme) return [{ message: 'Project has no README', key: '' }];
    if (readme.content === null) return [];
    const lines = readme.lines.filter((line) => line.trim() !== '').length;
    if (lines >= MIN_LINES) return [];
    return [{ file: readme.path, message: `README has only ${lines} non-empty lines (need ${MIN_LINES}+)`, key: '' }];
  },
};
```

`src/analyzer/rules/no-env-example.ts`:

```ts
import type { Rule } from './types.js';

const ENV_READ = /\bprocess\.env\b|\bimport\.meta\.env\b|\bos\.environ\b|\bos\.getenv\s*\(/;
const EXAMPLE_FILES = ['.env.example', '.env.sample', '.env.template'];

export const noEnvExampleRule: Rule = {
  id: 'generic/no-env-example',
  category: 'maintainability',
  severity: 'low',
  run(ctx) {
    if (EXAMPLE_FILES.some((name) => ctx.byPath.has(name))) return [];
    const readers = ctx.files.filter(
      (file) => file.kind === 'code' && file.content !== null && ENV_READ.test(file.content),
    );
    const first = readers[0];
    if (!first) return [];
    const more = readers.length > 1 ? ` and ${readers.length - 1} more` : '';
    // Project-level finding: no file, so the id stays the same when the list of readers changes.
    const message = `Code reads environment variables (${first.path}${more}) but there is no .env.example`;
    return [{ message, key: '' }];
  },
};
```

`src/analyzer/rules/no-lockfile.ts`:

```ts
import type { Rule } from './types.js';

export const LOCK_FILES: readonly string[] = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
];

export const noLockfileRule: Rule = {
  id: 'generic/no-lockfile',
  category: 'maintainability',
  severity: 'low',
  run(ctx) {
    // byPath holds every listed file, including unread binary ones such as bun.lockb.
    if (!ctx.byPath.has('package.json') || LOCK_FILES.some((name) => ctx.byPath.has(name))) return [];
    return [
      { file: 'package.json', message: 'package.json has no lock file, so installs are not reproducible', key: '' },
    ];
  },
};
```

`src/analyzer/rules/env-tracked.ts`:

```ts
import path from 'node:path';
import type { Rule, RuleHit } from './types.js';

// .gitignore lines that hide a root .env; the ones with a leading slash do not reach nested folders.
const ROOT_IGNORE_LINES: readonly string[] = ['.env', '/.env', '.env*', '/.env*', '*.env'];
const NESTED_IGNORE_LINES: readonly string[] = ['.env', '.env*', '*.env'];

export const envTrackedRule: Rule = {
  id: 'generic/env-tracked',
  category: 'security',
  severity: 'high',
  run(ctx) {
    const envFiles = ctx.files.filter((file) => path.posix.basename(file.path) === '.env');
    const hits: RuleHit[] = [];
    if (ctx.isGitRepo) {
      // In a repository every listed file is either tracked or untracked-but-not-ignored.
      for (const file of envFiles) {
        const message = ctx.tracked.has(file.path)
          ? `${file.path} is committed to git`
          : `${file.path} is not ignored by git`;
        hits.push({ file: file.path, message, key: file.path });
      }
      return hits;
    }
    const ignoreLines = new Set((ctx.byPath.get('.gitignore')?.lines ?? []).map((line) => line.trim()));
    for (const file of envFiles) {
      const accepted = file.path.includes('/') ? NESTED_IGNORE_LINES : ROOT_IGNORE_LINES;
      if (accepted.some((line) => ignoreLines.has(line))) continue;
      hits.push({ file: file.path, message: `${file.path} is not listed in .gitignore`, key: file.path });
    }
    return hits;
  },
};
```

`src/analyzer/rules/hardcoded-secret.ts`:

```ts
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Severity } from '../../types.js';
import { LOCK_FILES } from './no-lockfile.js';
import { matchContent } from './text.js';
import type { Rule, RuleHit } from './types.js';

interface SecretPattern {
  /** First part of the key; stage 7 picks the quest template by it. */
  type: string;
  label: string;
  pattern: RegExp;
  severity: Severity;
  /** Capture group holding the secret value; 0 = the whole match. */
  group: number;
}

const SPECIFIC: readonly SecretPattern[] = [
  { type: 'aws', label: 'AWS access key', pattern: /AKIA[0-9A-Z]{16}/g, severity: 'critical', group: 0 },
  { type: 'stripe', label: 'Stripe live key', pattern: /sk_live_[0-9a-zA-Z]{16,}/g, severity: 'critical', group: 0 },
  { type: 'stripe-test', label: 'Stripe test key', pattern: /sk_test_[0-9a-zA-Z]{16,}/g, severity: 'high', group: 0 },
  {
    type: 'telegram',
    label: 'Telegram bot token',
    pattern: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g,
    severity: 'critical',
    group: 0,
  },
  { type: 'github', label: 'GitHub token', pattern: /\bghp_[A-Za-z0-9]{36}\b/g, severity: 'critical', group: 0 },
  {
    type: 'private-key',
    label: 'private key',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    severity: 'critical',
    group: 0,
  },
];

const ASSIGNMENT: SecretPattern = {
  type: 'assignment',
  label: 'secret value',
  pattern: /\b(password|secret|api_key)\b\s*[:=]\s*['"]([^'"\s]{16,})['"]/gi,
  severity: 'high',
  group: 2,
};

// .env* belongs to generic/env-tracked; lock files are full of integrity hashes.
const SKIPPED_FILES: ReadonlySet<string> = new Set([...LOCK_FILES, 'poetry.lock', 'uv.lock', 'Pipfile.lock']);

function mask(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function toHit(file: string, line: number, secret: SecretPattern, value: string): RuleHit {
  // The value itself is never stored: the key holds its hash, the message a mask.
  const hash = createHash('sha256').update(value).digest('hex').slice(0, 16);
  return {
    file,
    line,
    message: `Hardcoded ${secret.label}: ${mask(value)}`,
    key: `${secret.type}:${hash}`,
    severity: secret.severity,
  };
}

export const hardcodedSecretRule: Rule = {
  id: 'generic/hardcoded-secret',
  category: 'security',
  severity: 'high',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      const base = path.posix.basename(file.path);
      if (file.content === null || base.startsWith('.env') || SKIPPED_FILES.has(base)) continue;
      const known = new Set<string>();
      for (const secret of SPECIFIC) {
        for (const { line, match } of matchContent(file, secret.pattern)) {
          const value = match[secret.group] ?? match[0];
          known.add(value);
          hits.push(toHit(file.path, line, secret, value));
        }
      }
      for (const { line, match } of matchContent(file, ASSIGNMENT.pattern)) {
        const value = match[ASSIGNMENT.group] ?? '';
        // `secret = 'sk_live_…'` is one finding of the specific type, not two.
        if (value === '' || known.has(value)) continue;
        hits.push(toHit(file.path, line, ASSIGNMENT, value));
      }
    }
    return hits;
  },
};
```

`src/analyzer/rules/index.ts` — полностью:

```ts
import { emptyCatchRule } from './empty-catch.js';
import { envTrackedRule } from './env-tracked.js';
import { hardcodedSecretRule } from './hardcoded-secret.js';
import { jsDebugLogRule } from './js-debug-log.js';
import { jsEvalRule } from './js-eval.js';
import { largeFileRule } from './large-file.js';
import { noEnvExampleRule } from './no-env-example.js';
import { noLockfileRule } from './no-lockfile.js';
import { noReadmeRule } from './no-readme.js';
import { skippedTestRule } from './skipped-test.js';
import { suppressionRule } from './suppression.js';
import { todoRule } from './todo.js';
import type { Rule } from './types.js';

/** Rules run in this order; each task appends its rules. */
export const RULES: readonly Rule[] = [
  todoRule,
  suppressionRule,
  skippedTestRule,
  emptyCatchRule,
  largeFileRule,
  jsEvalRule,
  jsDebugLogRule,
  noReadmeRule,
  noEnvExampleRule,
  noLockfileRule,
  envTrackedRule,
  hardcodedSecretRule,
];
```

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `npx vitest run tests/analyzer`
Expected: PASS — `project-rules.test.ts` 13, `hardcoded-secret.test.ts` 11, `rule-fixtures.test.ts` 25
(1 + 2 × 12 правил); остальные тесты зелёные.

Дополнительно убедиться, что в репозитории нет строк, похожих на секреты (плейсхолдеры и `join` не в счёт):

Run: `git grep --untracked -nE "sk_(live|test)_[0-9a-zA-Z]{16}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|[0-9]{8,10}:[A-Za-z0-9_-]{35}"`
Expected: пустой вывод (код выхода 1).

- [ ] **Step 6: Commit**

```powershell
npm run format
npm run check
git add src/analyzer/rules tests/analyzer/project-rules.test.ts tests/analyzer/hardcoded-secret.test.ts tests/fixtures/rules
git commit -m "feat(analyzer): project rules (readme, env example, lockfile, env tracked, hardcoded secrets)" -m "Co-Authored-By: <model> <noreply@anthropic.com>"
```

Expected от `npm run check`: без ошибок, все тесты зелёные.

---

### Task 9: Правила импорт-графа и тестов

**Files:**
- Create: `src/analyzer/rules/no-tests.ts`, `src/analyzer/rules/no-test-command.ts`,
  `src/analyzer/rules/untested-module.ts`, `src/analyzer/rules/import-cycle.ts`, `src/analyzer/rules/unused-file.ts`,
  `tests/analyzer/graph-rules.test.ts`
- Create (фикстуры): `tests/fixtures/rules/generic.no-tests/…`, `generic.no-test-command/…`,
  `generic.untested-module/…`, `generic.import-cycle/…`, `generic.unused-file/…`
- Modify: `src/analyzer/rules/index.ts`

**Interfaces:**
- Consumes: `AnalysisContext`, `isModule` (Task 6); `Rule`, `RuleHit` (Task 6); `ImportGraph` через `ctx.graph`
  (Task 3); `TestFacts` через `ctx.tests` (Task 4); `analyzeProject` (Task 6); `makeGitProject`, `cleanupTempDirs`.
- Produces:
  - `noTestsRule` — `generic/no-tests` (testing, high): модули есть, тестовых файлов нет; без файла, `key ''`;
  - `noTestCommandRule` — `generic/no-test-command` (testing, medium): тестовые файлы есть, `facts.commands.test`
    нет; `file: 'package.json'`, если он есть; `key ''`;
  - `untestedModuleRule` — `generic/untested-module` (testing, medium): модуль из `graphLanguages`, не точка входа,
    ≥ 5 непустых строк, его импортирует хотя бы один не тестовый файл, и он не в `tests.testedModules`; `key ''`;
  - `importCycleRule` — `generic/import-cycle` (architecture, medium): компонента сильной связности (Tarjan без
    рекурсии) размером ≥ 2 или самоимпорт, только не тестовые файлы; `file` = первый по сортировке файл,
    `key` = отсортированные файлы через `|`; сообщение `Import cycle: a → b → a` — кратчайшая петля от первого файла;
    экспортирует `stronglyConnected(nodes, edges): string[][]`;
  - `unusedFileRule` — `generic/unused-file` (clean-code, low): модуль из `graphLanguages`, не точка входа, его никто
    не импортирует (`importedBy` пуст); `key ''`.

- [ ] **Step 1: Написать падающие тесты**

`tests/analyzer/graph-rules.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/analyzer/analyze.js';
import { importCycleRule } from '../../src/analyzer/rules/import-cycle.js';
import { noTestCommandRule } from '../../src/analyzer/rules/no-test-command.js';
import type { Rule } from '../../src/analyzer/rules/types.js';
import { untestedModuleRule } from '../../src/analyzer/rules/untested-module.js';
import { unusedFileRule } from '../../src/analyzer/rules/unused-file.js';
import type { Finding } from '../../src/types.js';
import { cleanupTempDirs, makeGitProject } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

async function findingsOf(rule: Rule, files: Record<string, string>): Promise<Finding[]> {
  const root = await makeGitProject(files);
  const snapshot = await analyzeProject(root, { now: new Date(0), rules: [rule] });
  expect(snapshot.errors).toEqual([]);
  return snapshot.findings;
}

describe('generic/import-cycle', () => {
  it('reports a three-file cycle once, at its first file, with a stable key', async () => {
    const findings = await findingsOf(importCycleRule, {
      'src/a.ts': "import { b } from './b.js';\n\nexport function a(): number {\n  return b() + 1;\n}\n",
      'src/b.ts': "import { c } from './c.js';\n\nexport function b(): number {\n  return c() + 1;\n}\n",
      'src/c.ts': "import { a } from './a.js';\n\nexport function c(): number {\n  return a() + 1;\n}\n",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: 'generic/import-cycle',
      file: 'src/a.ts',
      key: 'src/a.ts|src/b.ts|src/c.ts',
      message: 'Import cycle: src/a.ts → src/b.ts → src/c.ts → src/a.ts',
    });
  });

  it('ignores a loop that goes through a test file', async () => {
    const findings = await findingsOf(importCycleRule, {
      'src/x.ts': "import { fixture } from './x.test.js';\n\nexport const x = fixture;\n",
      'src/x.test.ts': "import { x } from './x.js';\n\nexport const fixture = 1;\nexport const again = x;\n",
    });
    expect(findings).toEqual([]);
  });
});

describe('generic/untested-module', () => {
  it('skips entry points and modules shorter than 5 lines', async () => {
    const findings = await findingsOf(untestedModuleRule, {
      'src/index.ts': [
        "import { price } from './price.js';",
        "import { tiny } from './tiny.js';",
        '',
        'export const shown = price(tiny);',
        '',
      ].join('\n'),
      'src/price.ts': [
        'export function price(cents: number): number {',
        '  const base = cents / 100;',
        '  const tax = base * 0.2;',
        '  const total = base + tax;',
        '  return Math.round(total * 100) / 100;',
        '}',
        '',
      ].join('\n'),
      'src/tiny.ts': 'export const tiny = 1;\n',
    });
    expect(findings.map((finding) => finding.file)).toEqual(['src/price.ts']);
  });
});

describe('generic/unused-file', () => {
  it('flags only modules nobody imports, not entry points, configs, .d.ts or test-only helpers', async () => {
    const findings = await findingsOf(unusedFileRule, {
      'src/index.ts': "import { used } from './used.js';\n\nexport const value = used;\n",
      'src/used.ts': 'export const used = 1;\n',
      'src/lonely.ts': 'export const lonely = 2;\n',
      'src/only-in-tests.ts': 'export const helper = 3;\n',
      'src/only-in-tests.test.ts': "import { helper } from './only-in-tests.js';\n\nexport const check = helper;\n",
      'src/env.d.ts': 'declare const VERSION: string;\n',
      'vitest.config.ts': 'export default {};\n',
    });
    expect(findings.map((finding) => finding.file)).toEqual(['src/lonely.ts']);
  });
});

describe('generic/no-test-command', () => {
  const testedCode = {
    'src/sum.ts': 'export const sum = (a: number, b: number): number => a + b;\n',
    'src/sum.test.ts': "import { sum } from './sum.js';\n\nexport const three = sum(1, 2);\n",
  };

  it('points at package.json when its test script is the npm stub', async () => {
    const findings = await findingsOf(noTestCommandRule, {
      ...testedCode,
      'package.json': JSON.stringify({ name: 'demo', scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
    });
    expect(findings.map((finding) => finding.file)).toEqual(['package.json']);
  });

  it('reports without a file when there is no package.json at all', async () => {
    const findings = await findingsOf(noTestCommandRule, testedCode);
    expect(findings.map((finding) => finding.file)).toEqual([undefined]);
  });
});
```

- [ ] **Step 2: Добавить фикстуры правил**

Харнесс `tests/analyzer/rule-fixtures.test.ts` (Task 6) подхватывает папки сам.

`tests/fixtures/rules/generic.no-tests/bad/src/app.ts`:

```ts
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

`tests/fixtures/rules/generic.no-tests/good/src/app.ts` — тот же текст, что в bad.

`tests/fixtures/rules/generic.no-tests/good/src/app.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { greet } from './app.js';

test('greets by name', () => {
  assert.equal(greet('Ann'), 'Hello, Ann!');
});
```

`tests/fixtures/rules/generic.no-test-command/bad/package.json`:

```json
{
  "name": "sum-demo",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/sum.ts"
  }
}
```

`tests/fixtures/rules/generic.no-test-command/good/package.json`:

```json
{
  "name": "sum-demo",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/sum.ts",
    "test": "node --test"
  }
}
```

`tests/fixtures/rules/generic.no-test-command/bad/src/sum.ts` и `…/good/src/sum.ts`:

```ts
export function sum(a: number, b: number): number {
  return a + b;
}
```

`tests/fixtures/rules/generic.no-test-command/bad/src/sum.test.ts` и `…/good/src/sum.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sum } from './sum.ts';

test('adds two numbers', () => {
  assert.equal(sum(2, 3), 5);
});
```

`tests/fixtures/rules/generic.untested-module/bad/src/index.ts` и `…/good/src/index.ts`:

```ts
import { priceWithTax } from './price.js';

export const shown = priceWithTax(1999);
```

`tests/fixtures/rules/generic.untested-module/bad/src/price.ts` и `…/good/src/price.ts`:

```ts
const TAX_RATE = 0.2;

export function priceWithTax(cents: number): number {
  const tax = Math.round(cents * TAX_RATE);
  const total = cents + tax;
  return total;
}
```

`tests/fixtures/rules/generic.untested-module/good/src/price.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { priceWithTax } from './price.js';

test('adds 20% tax', () => {
  assert.equal(priceWithTax(1000), 1200);
});
```

`tests/fixtures/rules/generic.import-cycle/bad/src/a.ts`:

```ts
import { isEven } from './b.js';

export function isOdd(n: number): boolean {
  return n === 0 ? false : isEven(n - 1);
}
```

`tests/fixtures/rules/generic.import-cycle/bad/src/b.ts`:

```ts
import { isOdd } from './a.js';

export function isEven(n: number): boolean {
  return n === 0 ? true : isOdd(n - 1);
}
```

`tests/fixtures/rules/generic.import-cycle/good/src/a.ts`:

```ts
import { isEven } from './b.js';

export function isOdd(n: number): boolean {
  return !isEven(n);
}
```

`tests/fixtures/rules/generic.import-cycle/good/src/b.ts`:

```ts
export function isEven(n: number): boolean {
  return n % 2 === 0;
}
```

`tests/fixtures/rules/generic.unused-file/bad/src/index.ts`:

```ts
export function main(): string {
  return 'ready';
}
```

`tests/fixtures/rules/generic.unused-file/bad/src/old-helper.ts`:

```ts
export function legacyFormat(value: number): string {
  return value.toFixed(2);
}
```

`tests/fixtures/rules/generic.unused-file/good/src/index.ts`:

```ts
import { format } from './helper.js';

export function main(): string {
  return format(1);
}
```

`tests/fixtures/rules/generic.unused-file/good/src/helper.ts`:

```ts
export function format(value: number): string {
  return value.toFixed(2);
}
```

- [ ] **Step 3: Убедиться, что тесты падают**

Run: `npx vitest run tests/analyzer/graph-rules.test.ts tests/analyzer/rule-fixtures.test.ts`
Expected: FAIL — не найдены модули `src/analyzer/rules/import-cycle.js` и др.; в `rule-fixtures.test.ts` падают
«every rule has a fixture folder…» и тесты `bad`/`good` пяти новых папок (правил ещё нет в `RULES`).

- [ ] **Step 4: Реализовать**

`src/analyzer/rules/no-tests.ts`:

```ts
import { isModule } from '../context.js';
import type { Rule } from './types.js';

export const noTestsRule: Rule = {
  id: 'generic/no-tests',
  category: 'testing',
  severity: 'high',
  run(ctx) {
    const modules = ctx.files.filter((file) => isModule(file)).length;
    if (modules === 0 || ctx.files.some((file) => file.kind === 'test')) return [];
    return [{ message: `${modules} modules and not a single test file`, key: '' }];
  },
};
```

`src/analyzer/rules/no-test-command.ts`:

```ts
import type { Rule, RuleHit } from './types.js';

export const noTestCommandRule: Rule = {
  id: 'generic/no-test-command',
  category: 'testing',
  severity: 'medium',
  run(ctx) {
    const count = ctx.tests.testFiles.length;
    if (count === 0 || ctx.facts.commands.test) return [];
    const hit: RuleHit = { message: `${count} test files, but no test command runs them`, key: '' };
    if (ctx.byPath.has('package.json')) hit.file = 'package.json';
    return [hit];
  },
};
```

`src/analyzer/rules/untested-module.ts`:

```ts
import { isModule } from '../context.js';
import type { Rule, RuleHit } from './types.js';

const MIN_LINES = 5;

export const untestedModuleRule: Rule = {
  id: 'generic/untested-module',
  category: 'testing',
  severity: 'medium',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (!isModule(file) || !ctx.graphLanguages.has(file.language)) continue;
      if (ctx.entryPoints.has(file.path) || ctx.tests.testedModules.has(file.path)) continue;
      if (file.lines.filter((line) => line.trim() !== '').length < MIN_LINES) continue;
      const importers = ctx.graph.importedBy.get(file.path) ?? [];
      // "Used" means a non-test file imports it (spec §3.3, plan decisions).
      if (!importers.some((importer) => ctx.byPath.get(importer)?.kind !== 'test')) continue;
      hits.push({ file: file.path, message: `${file.path} is used by the project, but no test imports it`, key: '' });
    }
    return hits;
  },
};
```

`src/analyzer/rules/unused-file.ts`:

```ts
import { isModule } from '../context.js';
import type { Rule, RuleHit } from './types.js';

export const unusedFileRule: Rule = {
  id: 'generic/unused-file',
  category: 'clean-code',
  severity: 'low',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (!isModule(file) || !ctx.graphLanguages.has(file.language) || ctx.entryPoints.has(file.path)) continue;
      // Files outside the graph (unreadable) are unknown, not unused.
      const importers = ctx.graph.importedBy.get(file.path);
      if (!importers || importers.length > 0) continue;
      const message = `${file.path} is not imported anywhere and is not an entry point`;
      hits.push({ file: file.path, message, key: '' });
    }
    return hits;
  },
};
```

`src/analyzer/rules/import-cycle.ts`:

```ts
import type { Rule, RuleHit } from './types.js';

type Edges = ReadonlyMap<string, readonly string[]>;

interface Frame {
  node: string;
  next: number;
}

const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const importCycleRule: Rule = {
  id: 'generic/import-cycle',
  category: 'architecture',
  severity: 'medium',
  run(ctx) {
    const nodes = [...ctx.graph.imports.keys()]
      .filter((node) => ctx.byPath.get(node)?.kind !== 'test')
      .sort(byCodePoint);
    const inside = new Set(nodes);
    const edges = new Map<string, string[]>();
    for (const node of nodes) {
      edges.set(
        node,
        (ctx.graph.imports.get(node) ?? []).filter((target) => inside.has(target)),
      );
    }
    const hits: RuleHit[] = [];
    for (const component of stronglyConnected(nodes, edges)) {
      const first = component[0];
      if (first === undefined) continue;
      const selfImport = edges.get(first)?.includes(first) ?? false;
      if (component.length < 2 && !selfImport) continue;
      const loop = shortestLoop(first, new Set(component), edges);
      hits.push({ file: first, message: `Import cycle: ${loop.join(' → ')}`, key: component.join('|') });
    }
    return hits;
  },
};

/** Tarjan's strongly connected components without recursion: long import chains must not overflow the stack. */
export function stronglyConnected(nodes: readonly string[], edges: Edges): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  const indexOf = (node: string): number => index.get(node) ?? 0;
  const lowOf = (node: string): number => low.get(node) ?? 0;

  const enter = (node: string, work: Frame[]): void => {
    const order = index.size;
    index.set(node, order);
    low.set(node, order);
    stack.push(node);
    onStack.add(node);
    work.push({ node, next: 0 });
  };

  const popComponent = (root: string): string[] => {
    const component: string[] = [];
    for (let member = stack.pop(); member !== undefined; member = stack.pop()) {
      onStack.delete(member);
      component.push(member);
      if (member === root) break;
    }
    return component.sort(byCodePoint);
  };

  for (const root of nodes) {
    if (index.has(root)) continue;
    const work: Frame[] = [];
    enter(root, work);
    while (work.length > 0) {
      const frame = work[work.length - 1] as Frame;
      const targets = edges.get(frame.node) ?? [];
      if (frame.next < targets.length) {
        const target = targets[frame.next] as string;
        frame.next += 1;
        if (!index.has(target)) {
          enter(target, work);
        } else if (onStack.has(target)) {
          low.set(frame.node, Math.min(lowOf(frame.node), indexOf(target)));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.node, Math.min(lowOf(parent.node), lowOf(frame.node)));
      if (lowOf(frame.node) === indexOf(frame.node)) components.push(popComponent(frame.node));
    }
  }
  return components;
}

/** Shortest import loop that starts and ends at `start` (breadth-first, neighbours in sorted order). */
function shortestLoop(start: string, members: ReadonlySet<string>, edges: Edges): string[] {
  const parent = new Map<string, string>();
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head] as string;
    for (const target of edges.get(node) ?? []) {
      if (target === start) {
        const back: string[] = [];
        for (let at = node; at !== start; at = parent.get(at) ?? start) back.push(at);
        return [start, ...back.reverse(), start];
      }
      if (members.has(target) && !parent.has(target)) {
        parent.set(target, node);
        queue.push(target);
      }
    }
  }
  // Unreachable for a real component; kept so the function is total.
  return [...members, start];
}
```

Списки `graph.imports` уже отсортированы (Task 3), поэтому обход и петля в сообщении детерминированы.

`src/analyzer/rules/index.ts` — добавить импорты (порядок выровняет `npm run format`):

```ts
import { importCycleRule } from './import-cycle.js';
import { noTestCommandRule } from './no-test-command.js';
import { noTestsRule } from './no-tests.js';
import { untestedModuleRule } from './untested-module.js';
import { unusedFileRule } from './unused-file.js';
```

и дописать в массив `RULES` после последнего элемента:

```ts
  noTestsRule,
  noTestCommandRule,
  untestedModuleRule,
  importCycleRule,
  unusedFileRule,
```

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `npx vitest run tests/analyzer/graph-rules.test.ts tests/analyzer/rule-fixtures.test.ts`
Expected: PASS — `graph-rules.test.ts` 6 passed; в `rule-fixtures.test.ts` зелёные и 10 новых тестов (по два на
правило), и проверка «у каждого правила есть фикстура».

- [ ] **Step 6: Commit**

```powershell
npm run format
npm run check
git add src/analyzer/rules tests/analyzer/graph-rules.test.ts tests/fixtures/rules
git commit -m "feat(analyzer): graph rules - no tests, test command, untested module, import cycle, unused file" -m "Co-Authored-By: <model> <noreply@anthropic.com>"
```

Expected от `npm run check`: без ошибок, все тесты зелёные.

---

### Task 10: Дубли кода и оставшиеся правила JS/TS

**Files:**
- Create: `src/analyzer/rules/duplicate-block.ts`, `src/analyzer/rules/js-dangerous-html.ts`,
  `src/analyzer/rules/js-sync-fs-in-handler.ts`, `src/analyzer/rules/js-raw-img.ts`,
  `tests/analyzer/duplicate-block.test.ts`, `tests/analyzer/js-rules.test.ts`
- Create (фикстуры): `tests/fixtures/rules/generic.duplicate-block/…`, `js.dangerous-html/…`,
  `js.sync-fs-in-handler/…`, `js.raw-img/…`
- Modify: `src/analyzer/rules/index.ts`

**Interfaces:**
- Consumes: `SourceFile` (Task 1); `isCommentLine`, `matchLines`, `JS_LANGUAGES` (Task 6); `lineKey` (Task 6);
  `Rule`, `RuleHit`; `sourceFiles` (Task 2); `analyzeProject`, `makeGitProject`, `cleanupTempDirs`.
- Produces:
  - `duplicateBlockRule` — `generic/duplicate-block` (clean-code, medium); чистые функции
    `significantLines(file: SourceFile): SignificantLine[]` (`{ line, text }`, текст обрезан, пробелы схлопнуты) и
    `findDuplicateBlocks(files: readonly SourceFile[]): RuleHit[]`; константа `WINDOW = 8`;
  - `jsDangerousHtmlRule` — `js/dangerous-html` (security, high);
  - `jsSyncFsInHandlerRule` — `js/sync-fs-in-handler` (performance, medium);
  - `jsRawImgRule` — `js/raw-img` (performance, low).

Алгоритм дублей: значимые строки файла (kind `code`) → окна по 8 подряд → sha256 окна (16 hex). Хеш — дубль, если
встречается в двух разных файлах или в одном файле на расстоянии ≥ 8 окон (без перекрытия). Подряд идущие окна-дубли
файла склеиваются в «прогон»; ключ прогона — хеш его первого окна. Прогоны сортируются по (файл, строка), каждый ключ
выдаётся один раз — в первом месте; в сообщении — остальные места: `Duplicated block also at src/b.ts:4`. Больше пяти
мест — `…, and N more`.

- [ ] **Step 1: Написать падающие тесты**

`tests/analyzer/duplicate-block.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SourceFile } from '../../src/analyzer/files.js';
import { findDuplicateBlocks, significantLines } from '../../src/analyzer/rules/duplicate-block.js';
import { sourceFiles } from '../helpers/source-files.js';

const BLOCK = [
  '  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);',
  '  const discount = coupon ? subtotal * coupon.rate : 0;',
  '  const taxable = subtotal - discount;',
  '  const tax = Math.round(taxable * 0.2);',
  '  const shipping = taxable > 100 ? 0 : 10;',
  '  const total = taxable + tax + shipping;',
  '  audit.push({ subtotal, discount, tax, shipping });',
  '  return total;',
];

function source(lines: string[]): string {
  return `${lines.join('\n')}\n`;
}

function only(content: string): SourceFile {
  const [file] = sourceFiles({ 'src/x.ts': content });
  if (!file) throw new Error('sourceFiles returned nothing');
  return file;
}

describe('significantLines', () => {
  it('drops blank, comment, import, require and punctuation-only lines and collapses spaces', () => {
    const file = only(
      source([
        "import a from 'a';",
        "export { b } from './b.js';",
        "const c = require('c');",
        '',
        '// note',
        '});',
        'const d = 1;',
        '  let   e =  2;',
      ]),
    );
    expect(significantLines(file)).toEqual([
      { line: 7, text: 'const d = 1;' },
      { line: 8, text: 'let e = 2;' },
    ]);
  });
});

describe('findDuplicateBlocks', () => {
  it('reports a block shared by two files once, at the first file, ignoring comments and imports', () => {
    const a = source([
      'export function totalA(items, coupon) {',
      ...BLOCK.slice(0, 3),
      '  // keep in sync with billing',
      ...BLOCK.slice(3),
      '}',
    ]);
    const b = source([
      "import { audit } from './audit.js';",
      '',
      'export function totalB(items, coupon) {',
      ...BLOCK,
      '}',
    ]);
    expect(findDuplicateBlocks(sourceFiles({ 'src/a.ts': a, 'src/b.ts': b }))).toEqual([
      {
        file: 'src/a.ts',
        line: 2,
        message: 'Duplicated block also at src/b.ts:4',
        key: expect.stringMatching(/^[0-9a-f]{16}$/),
      },
    ]);
  });

  it('ignores blocks shorter than 8 significant lines', () => {
    const a = source(['export function totalA(items, coupon) {', ...BLOCK.slice(0, 7), '  return 1;', '}']);
    const b = source(['export function totalB(items, coupon) {', ...BLOCK.slice(0, 7), '  return 2;', '}']);
    expect(findDuplicateBlocks(sourceFiles({ 'src/a.ts': a, 'src/b.ts': b }))).toEqual([]);
  });

  it('finds a block repeated inside one file', () => {
    const a = source([
      'export function totalA(items, coupon) {',
      ...BLOCK,
      '}',
      'export function totalB(items, coupon) {',
      ...BLOCK,
      '}',
    ]);
    const hits = findDuplicateBlocks(sourceFiles({ 'src/a.ts': a }));
    expect(hits.map((hit) => [hit.file, hit.line, hit.message])).toEqual([
      ['src/a.ts', 2, 'Duplicated block also at src/a.ts:12'],
    ]);
  });

  it('does not look at test files', () => {
    const a = source(['export function totalA(items, coupon) {', ...BLOCK, '}']);
    const b = source(['export function totalB(items, coupon) {', ...BLOCK, '}']);
    expect(findDuplicateBlocks(sourceFiles({ 'src/a.test.ts': a, 'src/b.test.ts': b }))).toEqual([]);
  });
});
```

Разбор строк в тестах. Первый тест: значимые строки `src/a.ts` — заголовок (1), BLOCK в строках 2–4 и 6–10
(комментарий 5 выброшен), у `src/b.ts` — заголовок (3), BLOCK в строках 4–11 (импорт и пустая строка выброшены).
Совпадает только окно «BLOCK целиком»: в `a` оно начинается в строке 2, в `b` — в строке 4. Третий тест: значимые
строки — заголовок A (индекс 0), BLOCK (1–8), заголовок B (9), BLOCK (10–17); окна 1 и 10 равны и отстоят на 9 ≥ 8;
строки файла: 2 и 12.

`tests/analyzer/js-rules.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/analyzer/analyze.js';
import { jsRawImgRule } from '../../src/analyzer/rules/js-raw-img.js';
import { jsSyncFsInHandlerRule } from '../../src/analyzer/rules/js-sync-fs-in-handler.js';
import type { Rule } from '../../src/analyzer/rules/types.js';
import type { Finding } from '../../src/types.js';
import { cleanupTempDirs, makeGitProject } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

async function findingsOf(rule: Rule, files: Record<string, string>): Promise<Finding[]> {
  const root = await makeGitProject(files);
  return (await analyzeProject(root, { now: new Date(0), rules: [rule] })).findings;
}

const HERO = 'export function Hero() {\n  return <img src="/hero.png" alt="Hero" />;\n}\n';

describe('js/sync-fs-in-handler', () => {
  it('finds sync fs calls in an Express handler file, skipping comments and non-handler files', async () => {
    const findings = await findingsOf(jsSyncFsInHandlerRule, {
      'src/server.ts': [
        "import express from 'express';",
        "import { readFileSync } from 'node:fs';",
        '',
        'const app = express();',
        '',
        "app.get('/report', (_req, res) => {",
        '  // readFileSync(path) would block here',
        "  res.send(readFileSync('report.txt', 'utf8'));",
        '});',
        '',
      ].join('\n'),
      'src/config.ts': [
        "import fs from 'node:fs';",
        '',
        "export const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));",
        '',
      ].join('\n'),
    });
    expect(findings.map((finding) => [finding.file, finding.line, finding.message])).toEqual([
      ['src/server.ts', 8, 'readFileSync() blocks the event loop inside a request handler'],
    ]);
  });
});

describe('js/raw-img', () => {
  it('stays silent when the project does not use Next.js', async () => {
    const findings = await findingsOf(jsRawImgRule, {
      'package.json': JSON.stringify({ name: 'spa', dependencies: { react: '19.1.1' } }),
      'src/Hero.tsx': HERO,
    });
    expect(findings).toEqual([]);
  });

  it('flags <img> in a Next.js project', async () => {
    const findings = await findingsOf(jsRawImgRule, {
      'package.json': JSON.stringify({ name: 'site', dependencies: { next: '15.5.4', react: '19.1.1' } }),
      'src/Hero.tsx': HERO,
    });
    expect(findings.map((finding) => [finding.file, finding.line])).toEqual([['src/Hero.tsx', 2]]);
  });
});
```

- [ ] **Step 2: Добавить фикстуры правил**

`tests/fixtures/rules/generic.duplicate-block/bad/src/orders.ts` и `…/good/src/orders.ts`:

```ts
export interface Line {
  price: number;
  quantity: number;
}

export function orderTotal(lines: Line[], discountRate: number): number {
  let subtotal = 0;
  for (const line of lines) {
    subtotal += line.price * line.quantity;
  }
  const discount = subtotal * discountRate;
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * 0.2);
  const shipping = taxable > 100 ? 0 : 10;
  const total = taxable + tax + shipping;
  return Math.max(total, 0);
}
```

`tests/fixtures/rules/generic.duplicate-block/bad/src/invoices.ts` (те же 9 значимых строк тела):

```ts
import type { Line } from './orders.js';

export function invoiceTotal(lines: Line[], discountRate: number): number {
  let subtotal = 0;
  for (const line of lines) {
    subtotal += line.price * line.quantity;
  }
  const discount = subtotal * discountRate;
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * 0.2);
  const shipping = taxable > 100 ? 0 : 10;
  const total = taxable + tax + shipping;
  return Math.max(total, 0);
}
```

`tests/fixtures/rules/generic.duplicate-block/good/src/invoices.ts`:

```ts
import { type Line, orderTotal } from './orders.js';

export function invoiceTotal(lines: Line[], discountRate: number): number {
  return orderTotal(lines, discountRate);
}
```

`tests/fixtures/rules/js.dangerous-html/bad/src/Article.tsx`:

```tsx
export function Article({ html }: { html: string }) {
  return <article dangerouslySetInnerHTML={{ __html: html }} />;
}
```

`tests/fixtures/rules/js.dangerous-html/good/src/Article.tsx`:

```tsx
import DOMPurify from 'dompurify';

export function Article({ html }: { html: string }) {
  return <article dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;
}
```

`tests/fixtures/rules/js.sync-fs-in-handler/bad/app/api/report/route.ts`:

```ts
import { readFileSync } from 'node:fs';

export async function GET(): Promise<Response> {
  const report = readFileSync('data/report.json', 'utf8');
  return new Response(report, { headers: { 'content-type': 'application/json' } });
}
```

`tests/fixtures/rules/js.sync-fs-in-handler/good/app/api/report/route.ts`:

```ts
import { readFile } from 'node:fs/promises';

export async function GET(): Promise<Response> {
  const report = await readFile('data/report.json', 'utf8');
  return new Response(report, { headers: { 'content-type': 'application/json' } });
}
```

`tests/fixtures/rules/js.sync-fs-in-handler/good/src/config.ts` (синхронное чтение при старте — не в обработчике):

```ts
import { readFileSync } from 'node:fs';

export const config = JSON.parse(readFileSync('config.json', 'utf8')) as { port: number };
```

`tests/fixtures/rules/js.raw-img/bad/package.json` и `…/good/package.json`:

```json
{
  "name": "landing",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "next": "15.5.4",
    "react": "19.1.1",
    "react-dom": "19.1.1"
  }
}
```

`tests/fixtures/rules/js.raw-img/bad/app/page.tsx`:

```tsx
export default function Page() {
  return (
    <main>
      <img src="/hero.jpg" alt="Our product" />
    </main>
  );
}
```

`tests/fixtures/rules/js.raw-img/good/app/page.tsx`:

```tsx
import Image from 'next/image';

export default function Page() {
  return (
    <main>
      <Image src="/hero.jpg" alt="Our product" width={1200} height={600} />
    </main>
  );
}
```

- [ ] **Step 3: Убедиться, что тесты падают**

Run: `npx vitest run tests/analyzer/duplicate-block.test.ts tests/analyzer/js-rules.test.ts tests/analyzer/rule-fixtures.test.ts`
Expected: FAIL — не найдены модули `src/analyzer/rules/duplicate-block.js`, `js-raw-img.js`,
`js-sync-fs-in-handler.js`; в `rule-fixtures.test.ts` падают «every rule has a fixture folder…» и тесты
`bad`/`good` четырёх новых папок.

- [ ] **Step 4: Реализовать**

`src/analyzer/rules/duplicate-block.ts`:

```ts
import { createHash } from 'node:crypto';
import type { SourceFile } from '../files.js';
import { isCommentLine } from './text.js';
import type { Rule, RuleHit } from './types.js';

/** Minimal block size, in significant lines (spec §3.3). */
export const WINDOW = 8;
const MAX_LISTED = 5;

const NOT_SIGNIFICANT: readonly RegExp[] = [
  /^import\b/, // import x from 'y'; import 'y'; Python import x
  /^export\b.*\bfrom\s*['"]/, // re-exports
  /^from\s+\S+\s+import\b/, // Python from x import y
  /^(?:const|let|var)\s+[^=]+=\s*require\s*\(/, // CommonJS require
  /^[\s{}()[\];,.:<>/]*$/, // brackets and punctuation only (also blank)
];

export interface SignificantLine {
  /** 1-based line number in the file. */
  line: number;
  /** Trimmed text with whitespace runs collapsed to one space. */
  text: string;
}

interface Location {
  file: string;
  /** Window index = index of its first significant line. */
  index: number;
  line: number;
}

interface Run extends Location {
  hash: string;
}

export function significantLines(file: SourceFile): SignificantLine[] {
  const result: SignificantLine[] = [];
  for (const [index, raw] of file.lines.entries()) {
    const text = raw.trim().replace(/\s+/g, ' ');
    if (isCommentLine(text) || NOT_SIGNIFICANT.some((pattern) => pattern.test(text))) continue;
    result.push({ line: index + 1, text });
  }
  return result;
}

export function findDuplicateBlocks(files: readonly SourceFile[]): RuleHit[] {
  const locations = new Map<string, Location[]>();
  const windows: { file: string; hashes: string[]; lines: number[] }[] = [];
  for (const file of files) {
    if (file.kind !== 'code' || file.content === null) continue;
    const significant = significantLines(file);
    const hashes: string[] = [];
    const lines: number[] = [];
    for (let index = 0; index + WINDOW <= significant.length; index += 1) {
      const block = significant.slice(index, index + WINDOW);
      const hash = hashOf(block.map((entry) => entry.text).join('\n'));
      const line = block[0]?.line ?? 0;
      hashes.push(hash);
      lines.push(line);
      const list = locations.get(hash);
      const location = { file: file.path, index, line };
      if (list) list.push(location);
      else locations.set(hash, [location]);
    }
    windows.push({ file: file.path, hashes, lines });
  }

  const runs: Run[] = [];
  for (const entry of windows) {
    let previous = -2;
    for (const [index, hash] of entry.hashes.entries()) {
      if (!isDuplicated(locations.get(hash) ?? [])) continue;
      if (index !== previous + 1) runs.push({ file: entry.file, index, line: entry.lines[index] ?? 0, hash });
      previous = index;
    }
  }
  runs.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));

  const reported = new Set<string>();
  const hits: RuleHit[] = [];
  for (const run of runs) {
    if (reported.has(run.hash)) continue;
    const others = (locations.get(run.hash) ?? [])
      .filter((at) => at.file !== run.file || Math.abs(at.index - run.index) >= WINDOW)
      .map((at) => `${at.file}:${at.line}`);
    if (others.length === 0) continue;
    reported.add(run.hash);
    const listed = others.slice(0, MAX_LISTED).join(', ');
    const more = others.length > MAX_LISTED ? `, and ${others.length - MAX_LISTED} more` : '';
    hits.push({ file: run.file, line: run.line, message: `Duplicated block also at ${listed}${more}`, key: run.hash });
  }
  return hits;
}

/** Two places in different files, or two non-overlapping places in one file. */
function isDuplicated(list: readonly Location[]): boolean {
  const first = list[0];
  if (!first) return false;
  return list.some((at) => at.file !== first.file || at.index - first.index >= WINDOW);
}

function hashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export const duplicateBlockRule: Rule = {
  id: 'generic/duplicate-block',
  category: 'clean-code',
  severity: 'medium',
  run: (ctx) => findDuplicateBlocks(ctx.files),
};
```

`locations` каждого хеша упорядочены по (файл, окно): файлы идут в порядке `ctx.files` (отсортирован), окна — по
возрастанию. Поэтому в `isDuplicated` первое место — самое раннее в своём файле.

`src/analyzer/rules/js-dangerous-html.ts`:

```ts
import { lineKey } from '../findings.js';
import { isCommentLine, JS_LANGUAGES, matchLines } from './text.js';
import type { Rule, RuleHit } from './types.js';

const SANITIZER = /DOMPurify|sanitize/i;
const MESSAGE = 'dangerouslySetInnerHTML without a sanitizer (e.g. DOMPurify) in this file';

export const jsDangerousHtmlRule: Rule = {
  id: 'js/dangerous-html',
  category: 'security',
  severity: 'high',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (!JS_LANGUAGES.has(file.language) || file.kind === 'test' || file.content === null) continue;
      if (!file.content.includes('dangerouslySetInnerHTML') || SANITIZER.test(file.content)) continue;
      for (const { line, text } of matchLines(file, /dangerouslySetInnerHTML/)) {
        if (isCommentLine(text)) continue;
        hits.push({ file: file.path, line, message: MESSAGE, key: lineKey(text) });
      }
    }
    return hits;
  },
};
```

`src/analyzer/rules/js-sync-fs-in-handler.ts`:

```ts
import { lineKey } from '../findings.js';
import { isCommentLine, JS_LANGUAGES, matchLines } from './text.js';
import type { Rule, RuleHit } from './types.js';

const HANDLER_PATH = /^(?:src\/)?app\/.*\/route\.[cm]?[jt]sx?$|^(?:src\/)?pages\/api\//;
const HANDLER_CODE = /\b(?:app|router|server|fastify)\.(?:get|post|put|patch|delete|all|route)\s*\(/;
const SYNC_NAMES = [
  'readFileSync',
  'writeFileSync',
  'appendFileSync',
  'existsSync',
  'readdirSync',
  'statSync',
  'mkdirSync',
  'unlinkSync',
];
const SYNC_FS = new RegExp(`\\bfs\\.(\\w+Sync)\\s*\\(|\\b(${SYNC_NAMES.join('|')})\\s*\\(`);

export const jsSyncFsInHandlerRule: Rule = {
  id: 'js/sync-fs-in-handler',
  category: 'performance',
  severity: 'medium',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (!JS_LANGUAGES.has(file.language) || file.kind !== 'code' || file.content === null) continue;
      if (!HANDLER_PATH.test(file.path) && !HANDLER_CODE.test(file.content)) continue;
      for (const { line, text, match } of matchLines(file, SYNC_FS)) {
        if (isCommentLine(text)) continue;
        const name = match[1] ?? match[2] ?? 'sync fs call';
        hits.push({
          file: file.path,
          line,
          message: `${name}() blocks the event loop inside a request handler`,
          key: lineKey(text),
        });
      }
    }
    return hits;
  },
};
```

`src/analyzer/rules/js-raw-img.ts`:

```ts
import { lineKey } from '../findings.js';
import { isCommentLine, matchLines } from './text.js';
import type { Rule, RuleHit } from './types.js';

const JSX_FILE = /\.[jt]sx$/;
const MESSAGE = 'Raw <img> in a Next.js project: next/image resizes and lazy-loads images';

export const jsRawImgRule: Rule = {
  id: 'js/raw-img',
  category: 'performance',
  severity: 'low',
  run(ctx) {
    if (!ctx.facts.frameworks.includes('next')) return [];
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (!JSX_FILE.test(file.path) || file.kind === 'test' || file.content === null) continue;
      for (const { line, text } of matchLines(file, /<img\b/)) {
        if (isCommentLine(text)) continue;
        hits.push({ file: file.path, line, message: MESSAGE, key: lineKey(text) });
      }
    }
    return hits;
  },
};
```

`src/analyzer/rules/index.ts` — добавить импорты:

```ts
import { duplicateBlockRule } from './duplicate-block.js';
import { jsDangerousHtmlRule } from './js-dangerous-html.js';
import { jsRawImgRule } from './js-raw-img.js';
import { jsSyncFsInHandlerRule } from './js-sync-fs-in-handler.js';
```

и дописать в массив `RULES` после последнего элемента (после `unusedFileRule` из Task 9):

```ts
  duplicateBlockRule,
  jsDangerousHtmlRule,
  jsSyncFsInHandlerRule,
  jsRawImgRule,
```

После этого в `RULES` 21 правило (спек §3.3 без `generic/failing-tests`, которое переносится в этап 8).

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `npx vitest run tests/analyzer/duplicate-block.test.ts tests/analyzer/js-rules.test.ts tests/analyzer/rule-fixtures.test.ts`
Expected: PASS — `duplicate-block.test.ts` 5 passed, `js-rules.test.ts` 3 passed; в `rule-fixtures.test.ts` зелёные
и 8 новых тестов.

- [ ] **Step 6: Commit**

```powershell
npm run format
npm run check
git add src/analyzer/rules tests/analyzer/duplicate-block.test.ts tests/analyzer/js-rules.test.ts tests/fixtures/rules
git commit -m "feat(analyzer): duplicate blocks, dangerous html, sync fs in handlers, raw img" -m "Co-Authored-By: <model> <noreply@anthropic.com>"
```

Expected от `npm run check`: без ошибок, все тесты зелёные.

---

### Task 11: Проекты-фикстуры, детерминизм, скорость, статус этапа

**Files:**
- Create: `tests/fixtures/projects/nextjs-shop/…` (17 файлов), `tests/fixtures/projects/node-telegram-bot/…`
  (10 файлов), `tests/analyzer/projects.test.ts`, `tests/analyzer/performance.test.ts`
- Modify: `ПЛАН.md` (строка «Статус:»), `docs/superpowers/plans/2026-09-29-codequest-roadmap.md` (строка этапа 2)

**Interfaces:**
- Consumes: `analyzeProject` (Task 6); `copyFixture` (Task 6; путь относительно `tests/fixtures`, `_gitignore` →
  `.gitignore`, `_env…` → `.env…`, git-коммит по умолчанию); `makeTempDir`, `initGitRepo`, `commitAll`,
  `cleanupTempDirs` (Task 5); все 21 правило.
- Produces: две фикстуры для этапов 7 и 10. В них уже есть то, что найдут правила пакетов этапа 7 (сейчас их не ищет
  никто): вебхук Stripe без `constructEvent`, `/ban` без проверки прав, нет `bot.catch`, `fetch` без таймаута,
  11 регистраций обработчиков в одном файле.

Ожидаемые находки этапа 2 выведены применением всех 21 правила к файлам ниже. Фикстуры собраны так, чтобы находок
было мало и каждая была намеренной.

`nextjs-shop` — 5 находок:

| Правило | Файл | Почему |
|---|---|---|
| `generic/todo` | `lib/cart.ts` | `// TODO: validate quantity limits…` |
| `generic/untested-module` | `lib/cart.ts` | импортируют страницы, маршрут и `lib/payment.ts`; тестов нет |
| `generic/untested-module` | `lib/payment.ts` | импортируют два маршрута; тестов нет |
| `generic/unused-file` | `components/ProductBadge.tsx` | никто не импортирует, не точка входа |
| `js/raw-img` | `app/page.tsx` | `<img>` при зависимости `next` |

Чего нет и почему: `no-tests`, `no-test-command` — есть `lib/format.test.ts` и `"test": "node --test"`;
`no-readme` — README из 11 непустых строк; `no-lockfile` — `package-lock.json`; `no-env-example` — `.env.example`;
`untested-module` для `components/ProductCard.tsx` — в нём 4 непустые строки (< 5); `app/**` — точки входа Next.js;
`lib/format.ts` — протестирован; `console.log`, `eval`, пустых `catch`, подавлений, секретов, `fs.*Sync`,
`dangerouslySetInnerHTML`, циклов и повторов из 8 значимых строк нет.

`node-telegram-bot` — 2 находки:

| Правило | Файл | Почему |
|---|---|---|
| `generic/untested-module` | `src/parse.ts` | импортирует `src/bot.ts`; тестов нет |
| `js/debug-log` | `src/bot.ts` | `console.log('Bot started')` |

Чего нет: `src/bot.ts` — точка входа (`src/bot.*` и скрипт `start`); `src/format.ts` протестирован; `.env.example`,
README, lock-файл на месте; обработчики разные, поэтому 8-строчных повторов нет.

- [ ] **Step 1: Написать падающий тест проектов**

`tests/analyzer/projects.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/analyzer/analyze.js';
import type { Snapshot } from '../../src/types.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

const NOW = new Date('2026-09-29T12:00:00.000Z');

async function analyzeFixture(name: string): Promise<Snapshot> {
  const root = await copyFixture(`projects/${name}`);
  const snapshot = await analyzeProject(root, { now: NOW });
  expect(snapshot.errors).toEqual([]);
  return snapshot;
}

/** "rule file" pairs, sorted by code points. */
function pairs(snapshot: Snapshot): string[] {
  return snapshot.findings.map((finding) => `${finding.rule} ${finding.file ?? ''}`).sort();
}

describe('nextjs-shop fixture', () => {
  it('gets exactly the intended stage-2 findings', async () => {
    const snapshot = await analyzeFixture('nextjs-shop');
    expect(pairs(snapshot)).toEqual([
      'generic/todo lib/cart.ts',
      'generic/untested-module lib/cart.ts',
      'generic/untested-module lib/payment.ts',
      'generic/unused-file components/ProductBadge.tsx',
      'js/raw-img app/page.tsx',
    ]);
    const rules = snapshot.findings.map((finding) => finding.rule);
    expect(rules).not.toContain('generic/no-tests');
    expect(rules).not.toContain('generic/no-readme');
    expect(rules).not.toContain('generic/no-lockfile');
  });

  it('collects shop facts', async () => {
    const { facts } = await analyzeFixture('nextjs-shop');
    expect(facts).toMatchObject({
      languages: { typescript: 11 },
      stacks: ['js'],
      frameworks: ['next', 'react', 'stripe'],
      sourceFiles: 11,
      modules: 10,
      modulesWithTests: 1,
      testCasesTotal: 2,
      testCasesByModule: { 'lib/format.ts': 2 },
      botHandlers: 0,
      hotspots: [],
    });
    expect(facts.commands).toEqual({ test: 'npm test', build: 'npm run build' });
  });
});

describe('node-telegram-bot fixture', () => {
  it('gets exactly the intended stage-2 findings', async () => {
    const snapshot = await analyzeFixture('node-telegram-bot');
    expect(pairs(snapshot)).toEqual(['generic/untested-module src/parse.ts', 'js/debug-log src/bot.ts']);
    const rules = snapshot.findings.map((finding) => finding.rule);
    expect(rules).not.toContain('generic/no-tests');
    expect(rules).not.toContain('generic/no-readme');
    expect(rules).not.toContain('generic/no-lockfile');
  });

  it('counts all 11 handler registrations and collects bot facts', async () => {
    const { facts } = await analyzeFixture('node-telegram-bot');
    expect(facts.botHandlers).toBe(11);
    expect(facts).toMatchObject({
      languages: { typescript: 4 },
      stacks: ['js'],
      frameworks: ['telegraf'],
      sourceFiles: 4,
      modules: 3,
      modulesWithTests: 1,
      testCasesTotal: 3,
      testCasesByModule: { 'src/format.ts': 3 },
    });
    expect(facts.commands).toEqual({ test: 'npm test' });
  });
});

describe('determinism', () => {
  it.each(['nextjs-shop', 'node-telegram-bot'])('%s: same snapshot twice, same findings in a copy', async (name) => {
    const first = await copyFixture(`projects/${name}`);
    const second = await copyFixture(`projects/${name}`);
    const a = await analyzeProject(first, { now: NOW });
    const b = await analyzeProject(first, { now: NOW });
    const c = await analyzeProject(second, { now: NOW });
    expect(b).toEqual(a);
    expect(c.findings).toEqual(a.findings);
    expect(c.facts).toEqual(a.facts);
  });
});
```

Вторая копия лежит в другой временной папке, поэтому совпадение `findings` (с `id`) доказывает, что номера находок не
зависят от места проекта на диске.

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/analyzer/projects.test.ts`
Expected: FAIL — `copyFixture` не находит `tests/fixtures/projects/nextjs-shop` и `node-telegram-bot` (ENOENT).

- [ ] **Step 3: Создать фикстуру `nextjs-shop`**

Все файлы — в `tests/fixtures/projects/nextjs-shop/`.

`README.md`:

```markdown
# Autumn Shop

A small online store built with Next.js (App Router) and Stripe.

## Features

- Product list on the home page
- Cart page with totals
- Checkout through Stripe payment intents
- Stripe webhook that marks orders as paid

## Getting started

1. Copy `.env.example` to `.env` and fill in the Stripe keys.
2. Run `npm install`, then `npm run dev`.
3. Run the tests with `npm test`.
```

`_gitignore`:

```text
node_modules/
.next/
.env
.env.local
```

`_env.example`:

```text
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

`package.json`:

```json
{
  "name": "nextjs-shop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "node --test"
  },
  "dependencies": {
    "next": "15.5.4",
    "react": "19.1.1",
    "react-dom": "19.1.1",
    "stripe": "18.5.0"
  }
}
```

`package-lock.json`:

```json
{
  "name": "nextjs-shop",
  "version": "0.1.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "nextjs-shop",
      "version": "0.1.0",
      "dependencies": {
        "next": "15.5.4",
        "react": "19.1.1",
        "react-dom": "19.1.1",
        "stripe": "18.5.0"
      }
    }
  }
}
```

`tsconfig.json` (алиас `@/*` → корень, поэтому `aliasBase` = `''`):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

`app/layout.tsx`:

```tsx
import type { ReactNode } from 'react';

export const metadata = { title: 'Autumn Shop' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`app/page.tsx`:

```tsx
import { ProductCard } from '@/components/ProductCard';
import type { Product } from '@/lib/cart';

const products: Product[] = [
  { id: 'mug', name: 'Coffee mug', priceCents: 1299 },
  { id: 'tee', name: 'T-shirt', priceCents: 2499 },
  { id: 'cap', name: 'Baseball cap', priceCents: 1999 },
];

export default function HomePage() {
  return (
    <main>
      <img src="/banner.jpg" alt="Autumn sale" width={1200} height={400} />
      <h1>Autumn Shop</h1>
      <ul>
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </ul>
    </main>
  );
}
```

`app/cart/page.tsx`:

```tsx
import { type CartItem, cartTotal } from '@/lib/cart';
import { formatPrice } from '@/lib/format';

const demoCart: CartItem[] = [
  { productId: 'mug', name: 'Coffee mug', priceCents: 1299, quantity: 2 },
  { productId: 'tee', name: 'T-shirt', priceCents: 2499, quantity: 1 },
];

export default function CartPage() {
  return (
    <main>
      <h1>Your cart</h1>
      <ul>
        {demoCart.map((item) => (
          <li key={item.productId}>
            {item.name} x {item.quantity}: {formatPrice(item.priceCents * item.quantity)}
          </li>
        ))}
      </ul>
      <p>Total: {formatPrice(cartTotal(demoCart))}</p>
      <form action="/api/checkout" method="post">
        <button type="submit">Pay</button>
      </form>
    </main>
  );
}
```

`app/api/checkout/route.ts`:

```ts
import type { CartItem } from '@/lib/cart';
import { createPaymentIntent } from '@/lib/payment';

export async function POST(request: Request): Promise<Response> {
  const { cart } = (await request.json()) as { cart: CartItem[] };
  try {
    const clientSecret = await createPaymentIntent(cart);
    return Response.json({ clientSecret });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
```

`app/api/webhooks/stripe/route.ts` (вебхук доверяет телу запроса без проверки подписи — для этапа 7):

```ts
import { markOrderPaid } from '@/lib/payment';

interface StripeEvent {
  type: string;
  data: { object: { metadata: { orderId?: string } } };
}

export async function POST(request: Request): Promise<Response> {
  const payload = await request.text();
  const event = JSON.parse(payload) as StripeEvent;
  if (event.type === 'payment_intent.succeeded') {
    const orderId = event.data.object.metadata.orderId;
    if (orderId) {
      markOrderPaid(orderId);
    }
  }
  return new Response(null, { status: 200 });
}
```

`components/ProductCard.tsx` (ровно 4 непустые строки):

```tsx
import type { Product } from '@/lib/cart';

export function ProductCard({ product }: { product: Product }) {
  return <li>{product.name}</li>;
}
```

`components/ProductBadge.tsx`:

```tsx
export function ProductBadge({ label }: { label: string }) {
  return <span className="badge">{label}</span>;
}
```

`lib/cart.ts`:

```ts
export interface Product {
  id: string;
  name: string;
  priceCents: number;
}

export interface CartItem {
  productId: string;
  name: string;
  priceCents: number;
  quantity: number;
}

// TODO: validate quantity limits before adding to the cart
export function addItem(cart: CartItem[], product: Product, quantity: number): CartItem[] {
  const existing = cart.find((item) => item.productId === product.id);
  if (existing) {
    return cart.map((item) =>
      item.productId === product.id ? { ...item, quantity: item.quantity + quantity } : item,
    );
  }
  return [...cart, { productId: product.id, name: product.name, priceCents: product.priceCents, quantity }];
}

export function removeItem(cart: CartItem[], productId: string): CartItem[] {
  return cart.filter((item) => item.productId !== productId);
}

export function cartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}
```

`lib/payment.ts`:

```ts
import Stripe from 'stripe';
import { type CartItem, cartTotal } from './cart';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');
const paidOrders = new Set<string>();

export async function createPaymentIntent(cart: CartItem[]): Promise<string> {
  const amount = cartTotal(cart);
  if (amount <= 0) {
    throw new Error('Cart is empty');
  }
  const intent = await stripe.paymentIntents.create({ amount, currency: 'usd' });
  return intent.client_secret ?? '';
}

export function markOrderPaid(orderId: string): void {
  paidOrders.add(orderId);
}

export function isOrderPaid(orderId: string): boolean {
  return paidOrders.has(orderId);
}
```

`lib/format.ts`:

```ts
export function formatPrice(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, '0');
  return `$${dollars}.${rest}`;
}
```

`lib/format.test.ts` (расширение `.ts` в импорте — чтобы `node --test` на Node 24 запускал тест без сборки):

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPrice } from './format.ts';

test('formats cents as dollars', () => {
  assert.equal(formatPrice(1999), '$19.99');
});

test('formats zero', () => {
  assert.equal(formatPrice(0), '$0.00');
});
```

Итого 17 файлов: 11 `.ts`/`.tsx` (10 модулей + 1 тест) и `README.md`, `_gitignore`, `_env.example`,
`package.json`, `package-lock.json`, `tsconfig.json`.

- [ ] **Step 4: Создать фикстуру `node-telegram-bot`**

Все файлы — в `tests/fixtures/projects/node-telegram-bot/`.

`README.md`:

```markdown
# Shop Helper Bot

A Telegram bot for a small shop, built with Telegraf.

## Commands

- /start and /help: greeting and the command list
- /about: what the bot does
- /price <cents>: format a price
- /weather <city>: current weather from the weather API
- /remind <text>: save a reminder for this chat
- /feedback: send feedback to the team
- /ban <user id>: remove a user from the group

## Running

Copy `.env.example` to `.env`, set `BOT_TOKEN`, then run `npm start`. Tests: `npm test`.
```

`_gitignore`:

```text
node_modules/
.env
```

`_env.example`:

```text
BOT_TOKEN=
WEATHER_API_URL=
```

`package.json`:

```json
{
  "name": "node-telegram-bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/bot.ts",
    "test": "node --test"
  },
  "dependencies": {
    "telegraf": "4.16.3"
  }
}
```

`package-lock.json`:

```json
{
  "name": "node-telegram-bot",
  "version": "0.1.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "node-telegram-bot",
      "version": "0.1.0",
      "dependencies": {
        "telegraf": "4.16.3"
      }
    }
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true
  },
  "include": ["src"]
}
```

`src/bot.ts` — 11 регистраций (`start`, `help`, 6 × `command`, `hears`, `action`, `on`); `/ban` без проверки прав,
нет `bot.catch`, `fetch` без таймаута:

```ts
import { Markup, Telegraf } from 'telegraf';
import { formatPrice } from './format.ts';
import { parseCommand } from './parse.ts';

const bot = new Telegraf(process.env.BOT_TOKEN ?? '');
const reminders = new Map<number, string[]>();

bot.start((ctx) => ctx.reply('Welcome! Send /help to see what I can do.'));

bot.help((ctx) => ctx.reply('Commands: /about, /price, /weather, /remind, /feedback, /ban'));

bot.command('about', (ctx) => ctx.reply('Shop helper bot: prices, weather and reminders.'));

bot.command('price', (ctx) => {
  const { args } = parseCommand(ctx.message.text);
  const cents = Number(args[0] ?? '0');
  return ctx.reply(`Price: ${formatPrice(cents)}`);
});

bot.command('weather', async (ctx) => {
  const { args } = parseCommand(ctx.message.text);
  const city = args.join(' ') || 'London';
  const response = await fetch(`${process.env.WEATHER_API_URL}/current?city=${encodeURIComponent(city)}`);
  const data = (await response.json()) as { temperature: number };
  return ctx.reply(`${city}: ${data.temperature} C`);
});

bot.command('remind', (ctx) => {
  const { args } = parseCommand(ctx.message.text);
  const list = reminders.get(ctx.chat.id) ?? [];
  list.push(args.join(' '));
  reminders.set(ctx.chat.id, list);
  return ctx.reply(`Saved. This chat has ${list.length} reminders.`);
});

bot.command('feedback', (ctx) => ctx.reply('Thanks! Your feedback was sent to the team.'));

bot.command('ban', async (ctx) => {
  const { args } = parseCommand(ctx.message.text);
  const userId = Number(args[0]);
  await ctx.banChatMember(userId);
  return ctx.reply(`User ${userId} is banned.`);
});

bot.hears(/^hello\b/i, (ctx) => ctx.reply('Hello there!'));

bot.action('confirm', async (ctx) => {
  await ctx.answerCbQuery('Confirmed');
  return ctx.editMessageText('Order confirmed.');
});

bot.on('text', (ctx) => {
  const parsed = parseCommand(ctx.message.text);
  if (parsed.command) {
    return ctx.reply(`Unknown command: /${parsed.command}`);
  }
  return ctx.reply('Confirm your order?', Markup.inlineKeyboard([Markup.button.callback('Confirm', 'confirm')]));
});

bot.launch();
console.log('Bot started');
```

Проверка счёта по регулярке `countBotHandlers`: `bot.start(`, `bot.help(`, `bot.command(` × 6 (about, price,
weather, remind, feedback, ban), `bot.hears(`, `bot.action(`, `bot.on(` = 11; `bot.launch(` и
`Markup.button.callback(` под неё не попадают.

`src/parse.ts`:

```ts
export interface ParsedCommand {
  command: string | null;
  args: string[];
}

export function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) {
    return { command: null, args: trimmed ? trimmed.split(/\s+/) : [] };
  }
  const [head = '', ...args] = trimmed.split(/\s+/);
  const command = head.slice(1).split('@')[0] ?? '';
  return { command: command || null, args };
}
```

`src/format.ts`:

```ts
export function formatPrice(cents: number): string {
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return `${whole}.${fraction} USD`;
}
```

`src/format.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPrice } from './format.ts';

test('formats whole amounts', () => {
  assert.equal(formatPrice(500), '5.00 USD');
});

test('pads cents', () => {
  assert.equal(formatPrice(1205), '12.05 USD');
});

test('formats zero', () => {
  assert.equal(formatPrice(0), '0.00 USD');
});
```

Итого 10 файлов: 4 `.ts` (3 модуля + 1 тест) и `README.md`, `_gitignore`, `_env.example`, `package.json`,
`package-lock.json`, `tsconfig.json`.

- [ ] **Step 5: Проверить, что тесты самих фикстур запускаются**

Спек §10: JS-фикстуры тестируются через `node --test` без зависимостей (понадобится в этапе 8).

Run: `node --test` в папке `tests/fixtures/projects/nextjs-shop`, затем в `tests/fixtures/projects/node-telegram-bot`
Expected: `ℹ pass 2`, `ℹ fail 0` и `ℹ pass 3`, `ℹ fail 0` (Node 24 сам снимает типы с `.ts`).

- [ ] **Step 6: Убедиться, что тест проектов проходит**

Run: `npx vitest run tests/analyzer/projects.test.ts`
Expected: PASS — 6 passed. Если список находок расходится с ожидаемым, сначала найти, какое правило или факт дал
лишнюю/недостающую находку, и исправить фикстуру или правило по дизайну — ожидания в тесте не подгонять.

- [ ] **Step 7: Добавить тест скорости**

`tests/analyzer/performance.test.ts`:

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/analyzer/analyze.js';
import { cleanupTempDirs, commitAll, initGitRepo, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

const FILES = 1000;
const LIMIT_MS = 10_000;

function moduleName(index: number): string {
  return `mod${String(index).padStart(4, '0')}`;
}

/** 30 lines; every module imports the previous one, so the import graph is one long chain. */
function moduleSource(index: number): string {
  const start = index > 0 ? `total${index - 1}(values)` : '0';
  const lines = [
    index > 0 ? `import { total${index - 1} } from './${moduleName(index - 1)}.js';` : '// first module',
    '',
    `export function total${index}(values: number[]): number {`,
    `  let sum = ${start};`,
  ];
  // Constants differ per file, so no 8-line window repeats anywhere.
  for (let k = 0; k < 24; k += 1) lines.push(`  sum += values[${k}] ?? ${index * 31 + k};`);
  lines.push('  return sum;', '}');
  return `${lines.join('\n')}\n`;
}

describe('performance', () => {
  it(`analyzes ${FILES} code files in under ${LIMIT_MS} ms`, async () => {
    const root = await makeTempDir();
    await mkdir(path.join(root, 'src'));
    for (let index = 0; index < FILES; index += 1) {
      await writeFile(path.join(root, 'src', `${moduleName(index)}.ts`), moduleSource(index));
    }
    await initGitRepo(root);
    await commitAll(root, 'generated modules');

    const started = performance.now();
    const snapshot = await analyzeProject(root, { now: new Date('2026-09-29T00:00:00.000Z') });
    const elapsed = performance.now() - started;

    expect(snapshot.errors).toEqual([]);
    expect(snapshot.facts.modules).toBe(FILES);
    expect(elapsed).toBeLessThan(LIMIT_MS);
  }, 120_000);
});
```

Время подготовки (запись файлов и git-коммит) в замер не входит — только `analyzeProject`. Цепочка из 1000 импортов
заодно проверяет, что `stronglyConnected` не упирается в глубину стека.

Run: `npx vitest run tests/analyzer/performance.test.ts`
Expected: PASS — 1 passed. Тест не падает до реализации: он страж скорости для всего этапа. Если время ≥ 10 с —
найти медленный шаг (например, замерить `performance.now()` вокруг правил в `analyzeProject` локально) и ускорить
его; порог не повышать.

- [ ] **Step 8: Обновить статус этапа**

`ПЛАН.md` — заменить строку

```text
Статус: этап 1 (каркас) готов 29.09; следующий — этап 2, сканер JS/TS. Решения и открытые вопросы — в разделе 9.
```

на

```text
Статус: этапы 1 (каркас) и 2 (сканер JS/TS) готовы; следующий — этап 3, сканер Python. Решения и открытые вопросы — в разделе 9.
```

`docs/superpowers/plans/2026-09-29-codequest-roadmap.md` — заменить строку этапа 2

```text
| 2 | stage-2-scanner-js | `analyzer/`: файлы, факты, импорт-граф, общие правила и правила JS/TS, фикстуры правил | — |
```

на

```text
| 2 | `2026-09-29-codequest-stage-2-scanner-js.md` | `analyzer/`: файлы, факты, импорт-граф, общие правила и правила JS/TS, фикстуры правил | готов |
```

- [ ] **Step 9: Commit**

```powershell
npm run format
npm run check
git add tests/fixtures/projects tests/analyzer/projects.test.ts tests/analyzer/performance.test.ts ПЛАН.md docs/superpowers/plans/2026-09-29-codequest-roadmap.md
git commit -m "test(analyzer): shop and bot fixture projects, determinism and performance" -m "Co-Authored-By: <model> <noreply@anthropic.com>"
```

Expected от `npm run check`: без ошибок, `Test Files 28 passed`, `Tests 232 passed`.
