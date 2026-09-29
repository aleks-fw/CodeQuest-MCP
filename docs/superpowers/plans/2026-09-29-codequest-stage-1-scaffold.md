# CodeQuest этап 1 — каркас: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Рабочий TypeScript-проект, модель данных из спека и MCP-сервер с одним инструментом `get_project_state`,
который находит проект и отвечает по MCP в памяти и через настоящий stdio (`codequest mcp`).

**Architecture:** `engine/project.ts` определяет корень проекта и его номер. `tools/get-project-state.ts` вызывает
engine и форматирует ответ через `hud/`. `server/create-server.ts` собирает `McpServer` и достаёт roots клиента.
`cli/index.js` запускает сервер на stdio. Тесты MCP идут через `InMemoryTransport`, CLI — через `StdioClientTransport`
на собранном `dist/`.

**Tech Stack:** Node 24, TypeScript 7.0.2 (ESM, `NodeNext`, strict), `@modelcontextprotocol/sdk` 1.31.0, `zod` 4.6.5,
Vitest 5.0.2, Biome 2.5.14, `@types/node` 24.19.0, внешний `git`.

**Spec:** `docs/superpowers/specs/2026-09-28-codequest-design.md` (§2, §5, §9.1, §9.2, §9.5, §9.7, §12 этап 1).
Сквозные договорённости: `docs/superpowers/plans/2026-09-29-codequest-roadmap.md`.

## Global Constraints

- Папка проекта `D:\Claude\rpg game-code`; всё ставится только в неё (npm cache уже `D:\npm-cache`).
- Установка пакетов — только после «да» пользователя (Task 1, Step 2).
- ESM (`"type": "module"`), TypeScript `strict`, сборка `tsc` → `dist/`; `engines.node` = `>=22.12`.
- Runtime-зависимости только `@modelcontextprotocol/sdk` и `zod`; `smol-toml` добавляется в этапе 3.
- Ответы инструментов — на английском: короткий текст + `structuredContent`.
- Номер проекта — первые 12 символов sha256 от нормализованного пути корня; на Windows путь в нижнем регистре (спек §5).
- Корень проекта: `project_path` → первый root клиента → текущая папка сервера; от неё вверх до корня git, вне git —
  сама папка (спек §9.1).
- Нет пути или это не папка — понятное сообщение, сервер не падает (спек §9.7).
- В stdout сервера — только протокол MCP; диагностика — в stderr.
- Временные папки тестов — в `<repo>/.tmp/`, путь содержит пробел и кириллицу.
- Автор коммитов — локальная identity репозитория (`aleks-fw`); сообщение заканчивается строкой
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Путь с пробелом и кириллицей (`…\rpg game-code\.tmp\run X\тест проект`) — проект находится, имя и корень верные
   (все тесты используют такие папки — Task 3–5).
2. `project_path` указывает на файл или несуществующий путь — ответ `isError` с понятным текстом, следующий вызов
   работает (Task 4, тест «server survives a bad path»).
3. `project_path` — подпапка git-репозитория — корнем считается корень репозитория (Task 3).
4. Одна папка, записанная в другом регистре или со слешем в конце, на Windows даёт тот же номер (Task 3).
5. Клиент заявил roots, но `roots/list` падает — сервер берёт свою текущую папку, а не выдаёт ошибку (Task 4).

---

## Структура файлов после этапа

```
package.json, package-lock.json, tsconfig.json, tsconfig.build.json, biome.json, vitest.config.ts, .gitignore
src/
  version.ts                 VERSION
  types.ts                   модель данных спека §5 + ProjectRef
  errors.ts                  CodeQuestError — ошибка, текст которой можно показать пользователю
  engine/project.ts          resolveProject, projectId
  engine/index.ts            getProjectState — единственный вход для tools/cli
  hud/project.ts             formatProjectState — текст ответа
  tools/context.ts           ToolContext
  tools/errors.ts            toolError
  tools/get-project-state.ts registerGetProjectState
  server/create-server.ts    createServer
  cli/index.ts               codequest mcp
tests/
  helpers/temp-project.ts    временные проекты с git
  smoke.test.ts
  engine/project.test.ts
  server/server.test.ts
  cli/stdio.test.ts
```

---

### Task 1: Инструменты сборки и дымовой тест

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `biome.json`, `vitest.config.ts`, `.gitignore`,
  `src/version.ts`, `tests/smoke.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `VERSION: string` из `src/version.ts`; скрипты `npm run build | typecheck | lint | format | test | check`;
  переменная `GIT_CEILING_DIRECTORIES` в тестах (git не поднимается выше `<repo>/.tmp`, иначе папка без git внутри
  `.tmp` определилась бы как сам репозиторий CodeQuest).

- [ ] **Step 1: Создать конфиги**

`package.json`:

```json
{
  "name": "codequest-mcp",
  "version": "0.0.0",
  "private": true,
  "description": "RPG progression over real development work, as an MCP server",
  "license": "MIT",
  "type": "module",
  "bin": { "codequest": "dist/cli/index.js" },
  "engines": { "node": ">=22.12" },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "format": "biome check --write .",
    "test": "vitest run",
    "check": "npm run typecheck && npm run lint && npm run test"
  }
}
```

`tsconfig.json` (проверка типов всего, включая тесты):

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

`tsconfig.build.json` (сборка только `src/` в `dist/`):

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "rootDir": "src",
    "outDir": "dist",
    "sourceMap": true
  },
  "include": ["src"]
}
```

`biome.json`:

```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 120 },
  "javascript": { "formatter": { "quoteStyle": "single" } },
  "linter": { "enabled": true, "rules": { "recommended": true } }
}
```

`vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Temp projects live in <repo>/.tmp. Without a ceiling, git would walk up from a non-git temp folder
// and report the CodeQuest repository itself as the project root.
const tmpBase = fileURLToPath(new URL('.tmp', import.meta.url)).replaceAll('\\', '/');

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    env: { GIT_CEILING_DIRECTORIES: tmpBase },
  },
});
```

`.gitignore`:

```
node_modules/
dist/
coverage/
.tmp/
```

`src/version.ts`:

```ts
export const VERSION = '0.0.0';
```

`tests/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/version.js';

describe('toolchain', () => {
  it('runs TypeScript ESM tests', () => {
    expect(VERSION).toBe('0.0.0');
  });
});
```

- [ ] **Step 2: Спросить разрешение и установить пакеты**

Показать пользователю список ниже и дождаться «да». Потом:

```powershell
cd "D:\Claude\rpg game-code"
npm install --save-exact @modelcontextprotocol/sdk@1.31.0 zod@4.6.5
npm install --save-dev --save-exact typescript@7.0.2 vitest@5.0.2 @types/node@24.19.0 @biomejs/biome@2.5.14
```

Expected: `package-lock.json` создан, `node_modules/` на D, ошибок нет (предупреждения `npm warn` допустимы).

- [ ] **Step 3: Отформатировать и прогнать проверку**

```powershell
npm run format
npm run check
```

Expected: `tsc` без ошибок; `biome check` — `Checked N files … No fixes applied`; vitest — `1 passed`.
Если TypeScript 7 отвергает опцию в `tsconfig.json` — показать ошибку, убрать только эту опцию, записать это в отчёт.

- [ ] **Step 4: Commit**

```powershell
git add package.json package-lock.json tsconfig.json tsconfig.build.json biome.json vitest.config.ts .gitignore src tests
git commit -m "chore: scaffold TypeScript, Vitest and Biome" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Модель данных

**Files:**
- Create: `src/types.ts`

**Interfaces:**
- Consumes: —
- Produces: типы `Severity`, `QuestCategory`, `Finding`, `Snapshot`, `Facts`, `Quest`, `Criterion`, `CriterionResult`,
  `Baseline`, `Stats`, `CommandRun`, `ProjectState` (спек §5 дословно) и `ProjectRef { id; name; root }`.

- [ ] **Step 1: Записать `src/types.ts`**

```ts
// Data model shared by every module (spec §5). Add new fields here, not in modules.

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type QuestCategory =
  | 'bug'
  | 'testing'
  | 'architecture'
  | 'security'
  | 'performance'
  | 'refactoring'
  | 'cleanup'
  | 'dependencies'
  | 'documentation'
  | 'reliability'
  | 'maintainability';

/** A resolved project: stable id, folder name and absolute root path. */
export interface ProjectRef {
  id: string;
  name: string;
  root: string;
}

export interface Finding {
  id: string;
  rule: string;
  category: string;
  severity: Severity;
  file?: string;
  line?: number;
  message: string;
  key: string;
}

export interface Facts {
  languages: Record<string, number>;
  stacks: ('js' | 'python')[];
  frameworks: string[];
  domains: { pack: string; confidence: number; evidence: string[] }[];
  commands: { test?: string; lint?: string; build?: string };
  sourceFiles: number;
  modules: number;
  modulesWithTests: number;
  coverage?: number;
  testCasesTotal: number;
  testCasesByModule: Record<string, number>;
  codeLines: number;
  fileLines: Record<string, number>;
  botHandlers: number;
  hotspots: string[];
}

export interface Snapshot {
  schema: 1;
  takenAt: string;
  changeKey: string;
  head: string | null;
  facts: Facts;
  findings: Finding[];
  errors: { rule: string; message: string }[];
}

export interface Criterion {
  type:
    | 'finding_resolved'
    | 'target_exists'
    | 'tests_cover'
    | 'pattern_present'
    | 'pattern_absent'
    | 'command_passes'
    | 'no_regressions';
  params: Record<string, unknown>;
}

export interface CriterionResult {
  type: Criterion['type'];
  ok: boolean;
  detail: string;
}

export interface Baseline {
  head: string | null;
  takenAt: string;
  findings: string[];
  highFindings: string[];
  testCasesTotal: number;
  testCasesByModule: Record<string, number>;
  codeLines: number;
  fileLines: Record<string, number>;
  botHandlers: number;
  scripts: { test?: string; lint?: string; build?: string };
}

export interface Quest {
  id: string;
  template: string;
  pack: string;
  title: string;
  description: string;
  category: QuestCategory;
  difficulty: 'easy' | 'medium' | 'hard' | 'epic';
  findings: string[];
  criteria: Criterion[];
  subtasks?: Quest[];
  status: 'open' | 'completed' | 'obsolete';
  createdAt: string;
  baseline: Baseline;
  completedAt?: string;
  xpAwarded?: number;
  lastCheck?: CriterionResult[];
}

export interface Stats {
  architecture: number;
  testing: number;
  security: number;
  performance: number;
  cleanCode: number;
  reliability: number;
  maintainability: number;
  bugs: number;
  techDebt: number;
}

export interface CommandRun {
  ok: boolean;
  exitCode: number | null;
  failedTests?: number;
  durationMs: number;
  changeKey: string;
  at: string;
  tail: string;
}

export interface ProjectState {
  schema: 1;
  xp: number;
  level: number;
  stats: Stats;
  quests: Quest[];
  paidFindings: string[];
  shownEventSeq: number;
  lastRuns: { test?: CommandRun; lint?: CommandRun; build?: CommandRun };
}
```

- [ ] **Step 2: Проверить типы и линт**

Run: `npm run typecheck; npm run lint`
Expected: без ошибок. (Файл содержит только типы — поведения для unit-теста нет; его проверяет `tsc`.)

- [ ] **Step 3: Commit**

```powershell
git add src/types.ts
git commit -m "feat: add CodeQuest data model types" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Определение проекта

**Files:**
- Create: `src/errors.ts`, `src/engine/project.ts`, `tests/helpers/temp-project.ts`, `tests/engine/project.test.ts`

**Interfaces:**
- Consumes: `ProjectRef` из `src/types.ts`.
- Produces:
  - `class CodeQuestError extends Error` — ошибка, чей `message` можно показать пользователю;
  - `resolveProject(start: string): Promise<ProjectRef>` — `start` абсолютный или относительный к `process.cwd()`;
  - `projectId(root: string, platform?: NodeJS.Platform): string` — 12 hex-символов;
  - тестовые помощники `makeTempDir(): Promise<string>`, `makeGitProject(files?: Record<string, string>): Promise<string>`,
    `cleanupTempDirs(): Promise<void>`.

- [ ] **Step 1: Написать помощник временных проектов**

`tests/helpers/temp-project.ts`:

```ts
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const TMP_BASE = path.resolve(import.meta.dirname, '..', '..', '.tmp');

const created: string[] = [];

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
  await git(dir, 'init', '-q', '-b', 'main');
  await git(dir, 'add', '-A');
  await git(
    dir,
    '-c',
    'user.name=CodeQuest Test',
    '-c',
    'user.email=test@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-q',
    '-m',
    'init',
  );
  return dir;
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

- [ ] **Step 2: Написать падающие тесты**

`tests/engine/project.test.ts`:

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { projectId, resolveProject } from '../../src/engine/project.js';
import { CodeQuestError } from '../../src/errors.js';
import { cleanupTempDirs, makeGitProject, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

describe('resolveProject', () => {
  it('uses the git root when started from a subfolder', async () => {
    const root = await makeGitProject({ 'src/index.ts': 'export {};\n' });
    const project = await resolveProject(path.join(root, 'src'));
    expect(project.root).toBe(path.resolve(root));
    expect(project.name).toBe('тест проект');
    expect(project.id).toBe(projectId(root));
  });

  it('uses the folder itself outside git', async () => {
    const dir = await makeTempDir();
    const project = await resolveProject(dir);
    expect(project.root).toBe(path.resolve(dir));
    expect(project.name).toBe('тест проект');
  });

  it('rejects a missing path with a readable error', async () => {
    const dir = await makeTempDir();
    const missing = path.join(dir, 'нет такой папки');
    await expect(resolveProject(missing)).rejects.toThrow(CodeQuestError);
    await expect(resolveProject(missing)).rejects.toThrow(`Path not found: ${missing}`);
  });

  it('rejects a file with a readable error', async () => {
    const dir = await makeTempDir();
    const file = path.join(dir, 'notes.txt');
    await writeFile(file, 'x');
    await expect(resolveProject(file)).rejects.toThrow(`Not a folder: ${file}`);
  });

  it('works for nested folders with spaces', async () => {
    const root = await makeGitProject();
    const deep = path.join(root, 'a b', 'в г');
    await mkdir(deep, { recursive: true });
    expect((await resolveProject(deep)).root).toBe(path.resolve(root));
  });
});

describe('projectId', () => {
  it('is 12 lowercase hex characters', () => {
    expect(projectId('D:\\Claude\\shop', 'win32')).toMatch(/^[0-9a-f]{12}$/);
  });

  it('ignores case and a trailing slash on Windows', () => {
    expect(projectId('d:\\claude\\SHOP\\', 'win32')).toBe(projectId('D:\\Claude\\shop', 'win32'));
    expect(projectId('D:/Claude/shop', 'win32')).toBe(projectId('D:\\Claude\\shop', 'win32'));
  });

  it('keeps case on other platforms', () => {
    expect(projectId('/home/u/Shop', 'linux')).not.toBe(projectId('/home/u/shop', 'linux'));
  });

  it('differs between folders', () => {
    expect(projectId('D:\\a', 'win32')).not.toBe(projectId('D:\\b', 'win32'));
  });
});
```

- [ ] **Step 3: Убедиться, что тесты падают**

Run: `npx vitest run tests/engine/project.test.ts`
Expected: FAIL — `Cannot find module '../../src/engine/project.js'` (или `Failed to resolve import`).

- [ ] **Step 4: Реализовать**

`src/errors.ts`:

```ts
/** An error whose message is safe and useful to show to the user as is. */
export class CodeQuestError extends Error {
  override name = 'CodeQuestError';
}
```

`src/engine/project.ts`:

```ts
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { CodeQuestError } from '../errors.js';
import type { ProjectRef } from '../types.js';

const run = promisify(execFile);

/** Finds the project for a path: the enclosing git root, or the folder itself outside git (spec §9.1). */
export async function resolveProject(start: string): Promise<ProjectRef> {
  const dir = path.resolve(start);
  const info = await stat(dir).catch(() => null);
  if (!info) throw new CodeQuestError(`Path not found: ${dir}`);
  if (!info.isDirectory()) throw new CodeQuestError(`Not a folder: ${dir}`);
  const root = (await gitRoot(dir)) ?? dir;
  return { id: projectId(root), name: path.basename(root) || root, root };
}

/** First 12 hex chars of sha256 of the normalized root; case-insensitive on Windows (spec §5). */
export function projectId(root: string, platform: NodeJS.Platform = process.platform): string {
  const key = platform === 'win32' ? path.win32.resolve(root).toLowerCase() : path.posix.resolve(root);
  return createHash('sha256').update(key).digest('hex').slice(0, 12);
}

async function gitRoot(dir: string): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['rev-parse', '--show-toplevel'], { cwd: dir, windowsHide: true });
    const top = stdout.trim();
    return top ? path.resolve(top) : null;
  } catch {
    // Not a repository, or git is missing: the folder itself is the project.
    return null;
  }
}
```

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `npx vitest run tests/engine/project.test.ts`
Expected: PASS, `9 passed`.

- [ ] **Step 6: Commit**

```powershell
npm run format
git add src/errors.ts src/engine/project.ts tests/helpers/temp-project.ts tests/engine/project.test.ts
git commit -m "feat: resolve project root and id" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: MCP-сервер и инструмент `get_project_state`

**Files:**
- Create: `src/engine/index.ts`, `src/hud/project.ts`, `src/tools/context.ts`, `src/tools/errors.ts`,
  `src/tools/get-project-state.ts`, `src/server/create-server.ts`, `tests/server/server.test.ts`

**Interfaces:**
- Consumes: `resolveProject`, `CodeQuestError`, `ProjectRef`, `VERSION`; помощники `makeGitProject`, `makeTempDir`,
  `cleanupTempDirs`.
- Produces:
  - `interface ProjectRequest { projectPath?: string; roots?: string[]; cwd: string }`;
  - `interface ProjectStateView { project: ProjectRef }` — в этапе 9 сюда добавятся уровень, статы, квесты;
  - `getProjectState(request: ProjectRequest): Promise<ProjectStateView>` (engine);
  - `formatProjectState(view: ProjectStateView): string` (hud);
  - `interface ToolContext { cwd: string; getRoots(): Promise<string[]> }`;
  - `toolError(error: unknown): CallToolResult`;
  - `createServer(options: { cwd: string }): McpServer` с инструментом `get_project_state`
    (вход `project_path?: string`, выход `{ project: { id, name, root } }`).

- [ ] **Step 1: Написать падающие тесты**

`tests/server/server.test.ts`:

```ts
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { type CallToolResult, ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, describe, expect, it } from 'vitest';
import { createServer } from '../../src/server/create-server.js';
import { cleanupTempDirs, makeGitProject, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

interface ConnectOptions {
  cwd: string;
  /** Folders the client reports as roots; omit to declare no roots capability. */
  roots?: string[];
  /** Make roots/list fail although the capability is declared. */
  rootsFail?: boolean;
}

async function connect(options: ConnectOptions): Promise<Client> {
  const server = createServer({ cwd: options.cwd });
  const withRoots = options.roots !== undefined || options.rootsFail === true;
  const client = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: withRoots ? { roots: {} } : {} });
  if (withRoots) {
    client.setRequestHandler(ListRootsRequestSchema, async () => {
      if (options.rootsFail) throw new Error('roots unavailable');
      return { roots: (options.roots ?? []).map((root) => ({ uri: pathToFileURL(root).href })) };
    });
  }
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

async function callState(client: Client, args: Record<string, unknown> = {}): Promise<CallToolResult> {
  return (await client.callTool({ name: 'get_project_state', arguments: args })) as CallToolResult;
}

function textOf(result: CallToolResult): string {
  return result.content.map((part) => (part.type === 'text' ? part.text : '')).join('\n');
}

describe('MCP server', () => {
  it('lists exactly one tool', async () => {
    const client = await connect({ cwd: await makeTempDir() });
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['get_project_state']);
  });

  it('resolves project_path to its git root', async () => {
    const root = await makeGitProject({ 'src/app.ts': 'export {};\n' });
    const client = await connect({ cwd: await makeTempDir() });
    const result = await callState(client, { project_path: path.join(root, 'src') });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ project: { name: 'тест проект', root: path.resolve(root) } });
    expect(textOf(result)).toContain('тест проект');
  });

  it('falls back to the first client root', async () => {
    const root = await makeGitProject();
    const client = await connect({ cwd: await makeTempDir(), roots: [root] });
    const result = await callState(client);
    expect(result.structuredContent).toMatchObject({ project: { root: path.resolve(root) } });
  });

  it('falls back to the server folder without roots', async () => {
    const cwd = await makeGitProject();
    const client = await connect({ cwd });
    const result = await callState(client);
    expect(result.structuredContent).toMatchObject({ project: { root: path.resolve(cwd) } });
  });

  it('falls back to the server folder when roots/list fails', async () => {
    const cwd = await makeGitProject();
    const client = await connect({ cwd, rootsFail: true });
    const result = await callState(client);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ project: { root: path.resolve(cwd) } });
  });

  it('server survives a bad path', async () => {
    const good = await makeGitProject();
    const client = await connect({ cwd: good });
    const missing = path.join(good, 'нет такой папки');
    const bad = await callState(client, { project_path: missing });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toContain(`Path not found: ${missing}`);
    const next = await callState(client);
    expect(next.isError).toBeFalsy();
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run tests/server/server.test.ts`
Expected: FAIL — не найден модуль `../../src/server/create-server.js`.

- [ ] **Step 3: Реализовать engine и hud**

`src/engine/index.ts`:

```ts
import path from 'node:path';
import type { ProjectRef } from '../types.js';
import { resolveProject } from './project.js';

export interface ProjectRequest {
  /** Explicit path from the caller; relative paths resolve against cwd. */
  projectPath?: string;
  /** Folders reported by the MCP client, first one wins. */
  roots?: string[];
  /** The server's working folder, the last fallback. */
  cwd: string;
}

/** What get_project_state shows. Stage 9 adds level, XP, stats and quests. */
export interface ProjectStateView {
  project: ProjectRef;
}

export async function getProjectState(request: ProjectRequest): Promise<ProjectStateView> {
  const start = request.projectPath ?? request.roots?.[0] ?? request.cwd;
  const project = await resolveProject(path.resolve(request.cwd, start));
  return { project };
}
```

`hud/` импортирует из engine только тип (`import type` стирается при сборке), поэтому диска не касается.

`src/hud/project.ts`:

```ts
import type { ProjectStateView } from '../engine/index.js';

export function formatProjectState(view: ProjectStateView): string {
  const { project } = view;
  return [
    `CodeQuest · ${project.name}`,
    `Root: ${project.root}`,
    `Project id: ${project.id}`,
    'Campaign data is not available in this build yet.',
  ].join('\n');
}
```

- [ ] **Step 4: Реализовать инструмент и сервер**

`src/tools/context.ts`:

```ts
export interface ToolContext {
  /** The server's working folder. */
  cwd: string;
  /** Folders the MCP client reports as roots; empty when unavailable. */
  getRoots(): Promise<string[]>;
}
```

`src/tools/errors.ts`:

```ts
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CodeQuestError } from '../errors.js';

/** Turns any failure into a tool result, so one bad call never takes the server down. */
export function toolError(error: unknown): CallToolResult {
  const message =
    error instanceof CodeQuestError
      ? error.message
      : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
  return { isError: true, content: [{ type: 'text', text: message }] };
}
```

`src/tools/get-project-state.ts`:

```ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getProjectState } from '../engine/index.js';
import { formatProjectState } from '../hud/project.js';
import type { ToolContext } from './context.js';
import { toolError } from './errors.js';

export function registerGetProjectState(server: McpServer, context: ToolContext): void {
  server.registerTool(
    'get_project_state',
    {
      title: 'Get project state',
      description:
        'Show the CodeQuest campaign of a project: level, XP, stats and quests. In this build it only identifies the project.',
      inputSchema: {
        project_path: z
          .string()
          .optional()
          .describe('Project folder. Defaults to the first client root, then the server folder.'),
      },
      outputSchema: {
        project: z.object({ id: z.string(), name: z.string(), root: z.string() }),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ project_path }) => {
      try {
        const view = await getProjectState({
          projectPath: project_path,
          roots: await context.getRoots(),
          cwd: context.cwd,
        });
        return {
          content: [{ type: 'text', text: formatProjectState(view) }],
          structuredContent: { project: { ...view.project } },
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
```

`src/server/create-server.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetProjectState } from '../tools/get-project-state.js';
import { VERSION } from '../version.js';

export interface ServerOptions {
  /** Folder used when neither project_path nor client roots are given. */
  cwd: string;
}

export function createServer(options: ServerOptions): McpServer {
  const server = new McpServer({ name: 'codequest', version: VERSION });
  const context = { cwd: options.cwd, getRoots: () => clientRoots(server) };
  registerGetProjectState(server, context);
  return server;
}

async function clientRoots(server: McpServer): Promise<string[]> {
  if (!server.server.getClientCapabilities()?.roots) return [];
  try {
    const { roots } = await server.server.listRoots();
    return roots.filter((root) => root.uri.startsWith('file:')).map((root) => fileURLToPath(root.uri));
  } catch {
    // A client that declares roots but fails to list them should not break the tool.
    return [];
  }
}
```

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `npx vitest run tests/server/server.test.ts`
Expected: PASS, `6 passed`.

- [ ] **Step 6: Полная проверка и commit**

```powershell
npm run format
npm run check
git add src tests
git commit -m "feat: MCP server with get_project_state" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected от `npm run check`: tsc и biome без ошибок, vitest — `16 passed` (1 + 9 + 6).

---

### Task 5: CLI `codequest mcp` через настоящий stdio и итог этапа

**Files:**
- Create: `src/cli/index.ts`, `tests/cli/stdio.test.ts`
- Modify: `ПЛАН.md` (статус), `docs/superpowers/plans/2026-09-29-codequest-roadmap.md` (статус этапа 1)

**Interfaces:**
- Consumes: `createServer`; помощники `makeGitProject`, `cleanupTempDirs`.
- Produces: `dist/cli/index.js` — `codequest mcp` запускает сервер на stdio; без команды или с неизвестной — текст
  `Usage: codequest mcp` в stderr и код выхода 1. Остальные команды (`refresh`, `verify`, `hud`, `--home`) — этап 9.

- [ ] **Step 1: Написать падающие тесты**

`tests/cli/stdio.test.ts`:

```ts
import { exec, execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupTempDirs, makeGitProject } from '../helpers/temp-project.js';

const run = promisify(execFile);
const shell = promisify(exec);
const REPO = path.resolve(import.meta.dirname, '..', '..');
const CLI = path.join(REPO, 'dist', 'cli', 'index.js');

beforeAll(async () => {
  // Through the shell so npm.cmd resolves on Windows.
  await shell('npm run build', { cwd: REPO });
}, 120_000);

afterAll(cleanupTempDirs);

function stringEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

describe('codequest CLI', () => {
  it('serves MCP over stdio from the project folder', async () => {
    const project = await makeGitProject();
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI, 'mcp'],
      cwd: project,
      env: stringEnv(),
      stderr: 'pipe',
    });
    const client = new Client({ name: 'stdio-test', version: '0.0.0' });
    await client.connect(transport);
    try {
      const result = (await client.callTool({ name: 'get_project_state', arguments: {} })) as CallToolResult;
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({ project: { name: 'тест проект', root: path.resolve(project) } });
    } finally {
      await client.close();
    }
  });

  it('prints usage and exits with 1 without a command', async () => {
    const failure = await run(process.execPath, [CLI]).then(
      () => null,
      (error: { code?: number; stderr?: string }) => error,
    );
    expect(failure?.code).toBe(1);
    expect(failure?.stderr).toContain('Usage: codequest mcp');
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run tests/cli/stdio.test.ts`
Expected: FAIL — `dist/cli/index.js` не существует (ошибка подключения клиента или `Cannot find module`).

- [ ] **Step 3: Реализовать CLI**

`src/cli/index.ts`:

```ts
#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../server/create-server.js';

const USAGE = 'Usage: codequest mcp';

async function main(argv: string[]): Promise<void> {
  const [command] = argv;
  if (command === 'mcp') {
    // stdout belongs to the MCP protocol; anything diagnostic goes to stderr.
    await createServer({ cwd: process.cwd() }).connect(new StdioServerTransport());
    return;
  }
  process.stderr.write(`${USAGE}\n`);
  process.exitCode = 1;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`codequest: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run tests/cli/stdio.test.ts`
Expected: PASS, `2 passed`.

- [ ] **Step 5: Полная проверка этапа**

```powershell
npm run format
npm run check
npm run build
```

Expected: tsc и biome без ошибок; vitest — `18 passed`; `dist/cli/index.js` существует.

- [ ] **Step 6: Обновить статусы**

В `ПЛАН.md`, строка «Статус:» в шапке — заменить на:
`Статус: этап 1 (каркас) готов 29.09; следующий — этап 2, сканер JS/TS. Решения и открытые вопросы — в разделе 9.`

В `docs/superpowers/plans/2026-09-29-codequest-roadmap.md`, строка этапа 1 — статус `план готов` → `готов`.

- [ ] **Step 7: Commit**

```powershell
git add src tests ПЛАН.md docs/superpowers/plans
git commit -m "feat: codequest mcp stdio entry point" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Отчёт пользователю**

Коротко, по-русски: что сделано, список файлов, реальный вывод `npm run check` (последние строки vitest), что НЕ
проверено (регистрация в Claude Code — этап 10; работа на Linux/macOS — не проверялась). Следующий этап — только после
«да».
