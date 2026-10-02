# CodeQuest VS Code panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A VS Code extension that shows the CodeQuest level, XP, stats, quests and boss as a living pixel scene in an Explorer panel and a status bar item, with a "Check quest" button.

**Architecture:** The core gets `state --json` / `verify --json` (one JSON document). The extension (`vscode-extension/`, own manifest, built to `out/`) spawns the CLI with an argument array, parses the document defensively, and renders it in a webview canvas. Sprites are palette matrices drawn in code. Pure logic lives in `vscode-extension/src/shared` and `src/host/cli.ts` (no `vscode` import) and is tested by the root vitest from `tests/extension/`.

**Tech Stack:** TypeScript 7 (strict), Vitest, Biome, VS Code extension API (`@types/vscode`, `@vscode/vsce` for packaging), HTML canvas.

**Spec:** `docs/superpowers/specs/2026-10-02-codequest-vscode-panel-design.md`

## Global Constraints

- Everything on drive D; nothing installed on drive C. Installing the `.vsix` into the user's VS Code needs a separate explicit yes (Task 8, stop point). `npm install` of the extension's dev dependencies (Task 6, stop point) also needs a yes.
- Root `npm run check` (tsc --noEmit + biome check + vitest) stays green; root `tsconfig` has `verbatimModuleSyntax` and no DOM lib: files in `vscode-extension/src/shared` use `import type` and no DOM types.
- Wrong-typed or missing data counts as 0 / null / ignored; unknown ids are shown by id with a generic sprite.
- The CLI is spawned with an argument array, never a joined shell string (paths contain spaces and Cyrillic).
- ru and en strings must have identical placeholders; en/ru parity test of the core catalogs stays green.
- Local commits after each task; commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; no push.

## Rulings against the spec (carried by this plan)

- The spec's `recent` field is dropped. On the cached fast path a cycle has no events, so effects are derived in the extension from the difference of two consecutive documents. The document gets `quests.done` (completed quests) instead.
- `class` is `{ id, secondary?, name }` where `id` is the primary class id.
- The document gets `xp.max` (level 50).

## Review Focus

- `state --json` for a project with no class, no boss, a busy view: all fields present, `class: null`, `boss: null`.
- A malformed document (strings where numbers are expected, missing `quests`) must not throw in the extension: `parseState` returns a safe document or `null`.
- An error from the CLI (exit 1, JSON error document, or garbage stdout) shows a message, never a thrown exception in the host.
- First document after start must not fire a level-up effect; two identical documents fire none.
- A project path with a space and Cyrillic letters works end to end (`runCodeQuest`).

---

### Task 1: The state document (core)

**Files:**
- Create: `src/hud/state-json.ts`
- Test: `tests/hud/state-json.test.ts`

**Interfaces:**
- Consumes: `ProjectView` (`src/engine/index.ts`), `BossesView` (`src/game/bosses.ts`), `levelProgress`/`XP_PER_LEVEL`/`hudTitle` (`src/game/levels.ts`), `className` (`src/hud/classes.ts`), `bossName` (`src/hud/bosses.ts`), `questTitle` (`src/game/quests/text.ts`).
- Produces: `StateDocument` interface and `buildStateDocument(view: ProjectView, bosses: BossesView): StateDocument`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/hud/state-json.test.ts
import { describe, expect, it } from 'vitest';
import type { ProjectView } from '../../src/engine/index.js';
import type { BossesView } from '../../src/game/bosses.js';
import { buildStateDocument } from '../../src/hud/state-json.js';
import type { Quest } from '../../src/types.js';

const quest = (over: Partial<Quest>): Quest =>
  ({
    id: 'q1',
    template: 'x',
    pack: 'generic',
    title: 'Fix the thing',
    description: '',
    category: 'testing',
    difficulty: 'medium',
    findings: [],
    criteria: [],
    status: 'open',
    createdAt: '2026-10-01T00:00:00.000Z',
    ...over,
  }) as Quest;

const view = (over: Record<string, unknown> = {}, quests: Quest[] = []): ProjectView =>
  ({
    project: { id: 'p', name: 'shop', root: 'D:/проект 1/shop' },
    record: {},
    state: {
      xp: 975,
      level: 2,
      stats: {
        architecture: 70,
        testing: 40,
        security: 90,
        performance: 80,
        cleanCode: 60,
        reliability: 50,
        maintainability: 55,
        bugs: 30,
        techDebt: 20,
      },
      quests,
    },
    snapshot: null,
    busy: false,
    events: [],
    reports: [],
    unavailable: [],
    lang: 'en',
    owed: { count: 0, xp: 0 },
    playerClass: null,
    ...over,
  }) as unknown as ProjectView;

const bosses = (over: Partial<BossesView> = {}): BossesView =>
  ({ project: { id: 'p', name: 'shop', root: 'x' }, lang: 'en', active: [], defeated: [], ...over }) as BossesView;

describe('buildStateDocument', () => {
  it('describes level, xp inside the level, title and project', () => {
    const doc = buildStateDocument(view(), bosses());
    expect(doc.version).toBe(1);
    expect(doc.project).toEqual({ name: 'shop', path: 'D:/проект 1/shop' });
    expect(doc.level).toBe(2);
    expect(doc.xp).toEqual({ current: 475, forLevel: 500, max: false });
    expect(doc.title).not.toBe('');
    expect(doc.title).toBe(doc.title.toUpperCase());
    expect(doc.stats.security).toBe(90);
  });

  it('has class null and boss null when there are none, and passes busy and owed through', () => {
    const doc = buildStateDocument(view({ busy: true, owed: { count: 2, xp: 120 } }), bosses());
    expect(doc.class).toBeNull();
    expect(doc.boss).toBeNull();
    expect(doc.bossesActive).toBe(0);
    expect(doc.busy).toBe(true);
    expect(doc.owed).toEqual({ count: 2, xp: 120 });
  });

  it('names the class and its hybrid partner', () => {
    const player = { primary: 'tester', secondary: 'architect', shares: [], stats: [] };
    const doc = buildStateDocument(view({ playerClass: player }), bosses());
    expect(doc.class).toEqual({ id: 'tester', secondary: 'architect', name: 'Test Architect' });
    const solo = buildStateDocument(view({ playerClass: { ...player, secondary: undefined } }), bosses());
    expect(solo.class).toEqual({ id: 'tester', name: 'Tester' });
  });

  it('counts open, done and in-progress quests (at most five, accepted ones only)', () => {
    const quests = [
      ...Array.from({ length: 7 }, (_, i) =>
        quest({ id: `a${i}`, title: `Accepted ${i}`, acceptedAt: '2026-10-02T00:00:00.000Z' }),
      ),
      quest({ id: 'o', title: 'Open' }),
      quest({ id: 'c', status: 'completed' }),
      quest({ id: 'x', status: 'obsolete' }),
    ];
    const doc = buildStateDocument(view({}, quests), bosses());
    expect(doc.quests.open).toBe(8);
    expect(doc.quests.done).toBe(1);
    expect(doc.quests.inProgress).toHaveLength(5);
    expect(doc.quests.inProgress[0]).toEqual({ id: 'a0', title: 'Accepted 0', difficulty: 'medium' });
  });

  it('shows the first active boss by name and counts all of them; an unknown id is shown by id', () => {
    const active = [
      { id: 'graveyard', hp: 10, max: 12, spawnedAt: 't', quests: 1 },
      { id: 'from-the-future', hp: 3, max: 3, spawnedAt: 't', quests: 0 },
    ];
    const doc = buildStateDocument(view(), bosses({ active }));
    expect(doc.boss).toEqual({ id: 'graveyard', name: expect.any(String), hp: 10, max: 12 });
    expect(doc.boss?.name).not.toBe('graveyard');
    expect(doc.bossesActive).toBe(2);
    const odd = buildStateDocument(view(), bosses({ active: [active[1] as (typeof active)[number]] }));
    expect(odd.boss?.name).toBe('from-the-future');
  });

  it('speaks Russian when the view does and marks level 50 as max', () => {
    const ru = buildStateDocument(view({ lang: 'ru' }), bosses({ lang: 'ru' }));
    expect(ru.lang).toBe('ru');
    const top = view({ lang: 'en' });
    top.state.xp = 49 * 500 + 120;
    top.state.level = 50;
    expect(buildStateDocument(top, bosses()).xp.max).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hud/state-json.test.ts`
Expected: FAIL, cannot find module `../../src/hud/state-json.js`.

- [ ] **Step 3: Write the implementation**

```ts
// src/hud/state-json.ts
import type { ProjectView } from '../engine/index.js';
import type { BossesView } from '../game/bosses.js';
import { hudTitle, levelProgress, XP_PER_LEVEL } from '../game/levels.js';
import { questTitle } from '../game/quests/text.js';
import type { Lang } from '../i18n/index.js';
import type { Stats } from '../types.js';
import { bossName } from './bosses.js';
import { className } from './classes.js';

export const STATE_VERSION = 1;
export const MAX_IN_PROGRESS = 5;

/** What `state --json` and `verify --json` print: everything the VS Code panel shows (spec of the panel §3). */
export interface StateDocument {
  version: typeof STATE_VERSION;
  lang: Lang;
  project: { name: string; path: string };
  level: number;
  xp: { current: number; forLevel: number; max: boolean };
  title: string;
  stats: Stats;
  class: { id: string; secondary?: string; name: string } | null;
  /** A verification is running: this is the last saved state. */
  busy: boolean;
  owed: { count: number; xp: number };
  quests: { open: number; done: number; inProgress: { id: string; title: string; difficulty: string }[] };
  /** The first active boss in the order of the registry. */
  boss: { id: string; name: string; hp: number; max: number } | null;
  bossesActive: number;
}

export function buildStateDocument(view: ProjectView, bosses: BossesView): StateDocument {
  const { lang, state } = view;
  const progress = levelProgress(state.xp);
  const player = view.playerClass;
  const first = bosses.active[0];
  const open = state.quests.filter((quest) => quest.status === 'open');
  return {
    version: STATE_VERSION,
    lang,
    project: { name: view.project.name, path: view.project.root },
    level: progress.level,
    xp: { current: progress.xpIntoLevel, forLevel: XP_PER_LEVEL, max: progress.max },
    title: hudTitle(progress.level, lang),
    stats: state.stats,
    class:
      player === null
        ? null
        : {
            id: player.primary,
            ...(player.secondary === undefined ? {} : { secondary: player.secondary }),
            name: className(player, lang),
          },
    busy: view.busy,
    owed: { count: view.owed.count, xp: view.owed.xp },
    quests: {
      open: open.length,
      done: state.quests.filter((quest) => quest.status === 'completed').length,
      inProgress: open
        .filter((quest) => quest.acceptedAt !== undefined)
        .slice(0, MAX_IN_PROGRESS)
        .map((quest) => ({ id: quest.id, title: questTitle(quest, lang), difficulty: quest.difficulty })),
    },
    boss:
      first === undefined ? null : { id: first.id, name: bossName(first.id, lang), hp: first.hp, max: first.max },
    bossesActive: bosses.active.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hud/state-json.test.ts`
Expected: PASS (6 tests). If the `Test Architect` or title assertions differ from the catalog text, fix the test to the catalog value, not the code.

- [ ] **Step 5: Commit**

```bash
git add src/hud/state-json.ts tests/hud/state-json.test.ts
git commit -m "feat: state document for the VS Code panel"
```

---

### Task 2: CLI `state` and `--json`

**Files:**
- Modify: `src/cli/run.ts` (Parsed, parse, known commands, command handling), `src/i18n/en.ts`, `src/i18n/ru.ts` (usage keys), `USAGE_KEYS`
- Test: `tests/cli/state.test.ts`

**Interfaces:**
- Consumes: `buildStateDocument` (Task 1), `engine.view`, `engine.verify`, `engine.bosses`.
- Produces: `codequest state [--path P] [--home H]` and `codequest verify --json …` printing one JSON line; on error with `--json`: stdout `{"error":{"key":string,"message":string}}`, exit code 1.

- [ ] **Step 1: Write the failing test**

```ts
// tests/cli/state.test.ts
import { afterAll, describe, expect, it } from 'vitest';
import { type CliIo, runCli } from '../../src/cli/run.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

async function setup() {
  const project = await copyFixture('projects/nextjs-shop');
  const home = await makeTempDir();
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = {
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    cwd: await makeTempDir(),
    env: {},
  };
  const run = (...argv: string[]) => runCli([...argv, '--home', home], io);
  return { project, home, out, err, run };
}

describe('codequest state --json', () => {
  it('prints exactly one JSON document of version 1', async () => {
    const { project, out, run } = await setup();
    expect(await run('state', '--path', project)).toBe(0);
    const text = out.join('');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.trim().split('\n')).toHaveLength(1);
    const doc = JSON.parse(text);
    expect(doc.version).toBe(1);
    expect(doc.level).toBe(1);
    expect(doc.xp).toEqual({ current: 0, forLevel: 500, max: false });
    expect(doc.class).toBeNull();
    expect(doc.project.path).toContain('nextjs-shop');
  });

  it('verify --json prints the same document shape', async () => {
    const { project, out, run } = await setup();
    expect(await run('verify', '--json', '--path', project)).toBe(0);
    const doc = JSON.parse(out.join(''));
    expect(doc.version).toBe(1);
    expect(typeof doc.busy).toBe('boolean');
  });

  it('prints an error document and exits 1 when the project is not found, in the saved language', async () => {
    const { out, err, home, run } = await setup();
    const missing = `${home}/нет такой папки`;
    expect(await run('state', '--path', missing)).toBe(1);
    const doc = JSON.parse(out.join(''));
    expect(typeof doc.error.key).toBe('string');
    expect(doc.error.message.length).toBeGreaterThan(0);
    expect(err.join('')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/state.test.ts`
Expected: FAIL (usage printed, exit code 1 for `state`: unknown command).

- [ ] **Step 3: Implement**

In `src/cli/run.ts`:
1. `import { buildStateDocument } from '../hud/state-json.js';`
2. `Parsed` gets `json: boolean`; `parse` starts with `json: false` and handles `else if (arg === '--json') parsed.json = true;`.
3. `known` becomes `['refresh', 'verify', 'hud', 'board', 'lang', 'state']`; `USAGE_KEYS` gets `'usage.state'` after `'usage.verify'`.
4. In the `try` block, before the `refresh` branch:

```ts
    if (command === 'state' || (command === 'verify' && parsed.json)) {
      const view =
        command === 'state' ? await engine.view(request) : await engine.verify(request, parsed.positional[0]);
      io.stdout(`${JSON.stringify(buildStateDocument(view, await engine.bosses(request)))}\n`);
      return 0;
    }
```
   (turn the following `if (command === 'refresh')` into `else if` chain accordingly or keep it after this `if` with its own `if`).
5. In the `catch`: when `parsed.json` is true print to stdout and return 1:

```ts
    const lang = await readLanguage(homeOf(parsed, io.env)).catch(() => 'en' as const);
    if (parsed.json || command === 'state') {
      const key = error instanceof CodeQuestError && error.text !== undefined ? error.text.key : 'error.unexpected';
      io.stdout(`${JSON.stringify({ error: { key, message: errorText(error, lang) } })}\n`);
      return 1;
    }
    io.stderr(`codequest: ${errorText(error, lang)}\n`);
    return 1;
```

In `src/i18n/en.ts` after `'usage.verify'`:
`'usage.state': '  codequest state [--path P]                 print the state as one JSON line (the VS Code panel uses it)',`
(and `verify` line mentions `--json`: `'  codequest verify [quest] [--json] [--path P]  …'` keep alignment, optional).
In `src/i18n/ru.ts` the same key in Russian: `'usage.state': '  codequest state [--path P]                 вывести состояние одной JSON-строкой (им пользуется панель VS Code)',`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/cli tests/i18n`
Expected: PASS, including the existing `run.test.ts` and catalog parity tests. If the missing-path test returns a document instead of an error (resolve walks up to a parent), change the test path to a file path of a non-existing drive-less folder that the resolver rejects, and note it as a ruling in the ledger.

- [ ] **Step 5: Commit**

```bash
git add src/cli/run.ts src/i18n tests/cli/state.test.ts
git commit -m "feat: codequest state and verify --json"
```

---

### Task 3: Extension scaffold and the shared document parser

**Files:**
- Create: `vscode-extension/package.json`, `vscode-extension/tsconfig.json` (host), `vscode-extension/tsconfig.webview.json`, `vscode-extension/.vscodeignore`, `vscode-extension/README.md`, `vscode-extension/src/shared/state.ts`
- Modify: `.gitignore` (add `out/` and `*.vsix`)
- Test: `tests/extension/state.test.ts`

**Interfaces:**
- Produces (`shared/state.ts`): `interface StateDoc` (same shape as `StateDocument`, all fields required), `parseState(raw: unknown): StateDoc | null`, `parseCliOutput(stdout: string): CliResult` with `type CliResult = { ok: true; doc: StateDoc } | { ok: false; message: string }`, `emptyStats()`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/extension/state.test.ts
import { describe, expect, it } from 'vitest';
import { parseCliOutput, parseState } from '../../vscode-extension/src/shared/state.js';

const good = {
  version: 1,
  lang: 'en',
  project: { name: 'shop', path: 'D:/x' },
  level: 2,
  xp: { current: 475, forLevel: 500, max: false },
  title: 'APPRENTICE',
  stats: { architecture: 70, testing: 40, security: 90, performance: 80, cleanCode: 60, reliability: 50, maintainability: 55, bugs: 30, techDebt: 20 },
  class: { id: 'tester', name: 'Tester' },
  busy: false,
  owed: { count: 1, xp: 60 },
  quests: { open: 3, done: 2, inProgress: [{ id: 'a', title: 'Fix', difficulty: 'hard' }] },
  boss: { id: 'graveyard', name: 'Graveyard', hp: 5, max: 9 },
  bossesActive: 1,
};

describe('parseState', () => {
  it('keeps a good document as it is', () => {
    expect(parseState(good)).toEqual(good);
  });

  it('turns wrong types into safe values and never throws', () => {
    const doc = parseState({ version: 1, level: 'x', xp: 5, quests: null, boss: { id: 3 }, stats: { testing: 'a', security: 120 }, lang: 'de' });
    expect(doc).not.toBeNull();
    expect(doc?.level).toBe(1);
    expect(doc?.xp).toEqual({ current: 0, forLevel: 500, max: false });
    expect(doc?.quests).toEqual({ open: 0, done: 0, inProgress: [] });
    expect(doc?.boss).toBeNull();
    expect(doc?.stats.testing).toBe(0);
    expect(doc?.stats.security).toBe(100);
    expect(doc?.lang).toBe('en');
  });

  it('returns null for something that is not a version-1 document', () => {
    for (const raw of [null, 5, 'x', [], {}, { version: 2 }]) expect(parseState(raw)).toBeNull();
  });
});

describe('parseCliOutput', () => {
  it('parses a document from the last non-empty line', () => {
    const result = parseCliOutput(`noise\n${JSON.stringify(good)}\n`);
    expect(result.ok).toBe(true);
  });

  it('turns an error document into its message', () => {
    expect(parseCliOutput('{"error":{"key":"k","message":"No project here"}}\n')).toEqual({
      ok: false,
      message: 'No project here',
    });
  });

  it('turns garbage and empty output into a readable message', () => {
    for (const text of ['', '\n', 'not json', '{"a":1}']) {
      const result = parseCliOutput(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/extension/state.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`vscode-extension/src/shared/state.ts`:

```ts
export type Lang = 'en' | 'ru';

export const STAT_KEYS = [
  'architecture',
  'testing',
  'security',
  'performance',
  'cleanCode',
  'reliability',
  'maintainability',
  'bugs',
  'techDebt',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export interface StateDoc {
  version: 1;
  lang: Lang;
  project: { name: string; path: string };
  level: number;
  xp: { current: number; forLevel: number; max: boolean };
  title: string;
  stats: Record<StatKey, number>;
  class: { id: string; secondary?: string; name: string } | null;
  busy: boolean;
  owed: { count: number; xp: number };
  quests: { open: number; done: number; inProgress: { id: string; title: string; difficulty: string }[] };
  boss: { id: string; name: string; hp: number; max: number } | null;
  bossesActive: number;
}

export type CliResult = { ok: true; doc: StateDoc } | { ok: false; message: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const obj = (value: unknown): Record<string, unknown> => (isObject(value) ? value : {});

/** A document from the CLI with every field made safe; null when it is not a version-1 document at all. */
export function parseState(raw: unknown): StateDoc | null {
  if (!isObject(raw) || raw.version !== 1) return null;
  const xp = obj(raw.xp);
  const project = obj(raw.project);
  const stats = obj(raw.stats);
  const quests = obj(raw.quests);
  const owed = obj(raw.owed);
  const cls = obj(raw.class);
  const boss = obj(raw.boss);
  const inProgress = Array.isArray(quests.inProgress) ? quests.inProgress : [];
  return {
    version: 1,
    lang: raw.lang === 'ru' ? 'ru' : 'en',
    project: { name: str(project.name), path: str(project.path) },
    level: Math.max(1, Math.floor(num(raw.level, 1))),
    xp: { current: Math.max(0, num(xp.current)), forLevel: num(xp.forLevel, 500) || 500, max: xp.max === true },
    title: str(raw.title),
    stats: Object.fromEntries(
      STAT_KEYS.map((key) => [key, Math.min(100, Math.max(0, num(stats[key])))]),
    ) as Record<StatKey, number>,
    class:
      typeof cls.id === 'string' && cls.id !== ''
        ? {
            id: cls.id,
            ...(typeof cls.secondary === 'string' ? { secondary: cls.secondary } : {}),
            name: str(cls.name, cls.id),
          }
        : null,
    busy: raw.busy === true,
    owed: { count: Math.max(0, num(owed.count)), xp: Math.max(0, num(owed.xp)) },
    quests: {
      open: Math.max(0, num(quests.open)),
      done: Math.max(0, num(quests.done)),
      inProgress: inProgress.flatMap((item) =>
        isObject(item) && typeof item.id === 'string'
          ? [{ id: item.id, title: str(item.title, item.id), difficulty: str(item.difficulty, 'easy') }]
          : [],
      ),
    },
    boss:
      typeof boss.id === 'string' && boss.id !== ''
        ? { id: boss.id, name: str(boss.name, boss.id), hp: Math.max(0, num(boss.hp)), max: Math.max(1, num(boss.max, 1)) }
        : null,
    bossesActive: Math.max(0, Math.floor(num(raw.bossesActive))),
  };
}

/** The result of one CLI call: a document, or a message to show instead (never throws). */
export function parseCliOutput(stdout: string): CliResult {
  const line = stdout
    .split('\n')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .at(-1);
  if (line === undefined) return { ok: false, message: 'CodeQuest printed nothing' };
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return { ok: false, message: `CodeQuest printed something unexpected: ${line.slice(0, 120)}` };
  }
  if (isObject(raw) && isObject(raw.error)) return { ok: false, message: str(raw.error.message, 'CodeQuest failed') };
  const doc = parseState(raw);
  return doc === null ? { ok: false, message: 'CodeQuest printed an unknown document' } : { ok: true, doc };
}
```

`vscode-extension/package.json`:

```json
{
  "name": "codequest-vscode",
  "displayName": "CodeQuest",
  "description": "RPG progression of your project: level, XP, stats, quests and bosses as a pixel scene",
  "version": "0.1.0",
  "publisher": "aleks-fw",
  "private": true,
  "license": "MIT",
  "engines": { "vscode": "^1.90.0" },
  "main": "./out/host/extension.js",
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "views": { "explorer": [{ "type": "webview", "id": "codequest.panel", "name": "CodeQuest" }] },
    "commands": [
      { "command": "codequest.verify", "title": "CodeQuest: Check quest" },
      { "command": "codequest.refresh", "title": "CodeQuest: Refresh" }
    ],
    "configuration": {
      "title": "CodeQuest",
      "properties": {
        "codequest.cliPath": { "type": "string", "default": "D:\\Claude\\rpg game-code\\dist\\cli\\index.js", "description": "Path to dist/cli/index.js of CodeQuest" },
        "codequest.nodePath": { "type": "string", "default": "node", "description": "Node.js executable" },
        "codequest.home": { "type": "string", "default": "D:\\Claude\\codequest-data", "description": "CodeQuest data folder (CODEQUEST_HOME)" },
        "codequest.pollSeconds": { "type": "number", "default": 30, "minimum": 10, "description": "How often to refresh while the panel is visible" }
      }
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json && tsc -p tsconfig.webview.json",
    "package": "vsce package --no-dependencies"
  },
  "devDependencies": {
    "@types/vscode": "1.90.0",
    "@vscode/vsce": "3.6.0"
  }
}
```
(Version numbers of the devDependencies: use the latest that `npm view` reports at install time; they are installed in Task 6 only after the user's yes.)

`vscode-extension/tsconfig.json` (host, CommonJS because the package has no `"type"`):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "outDir": "out/host",
    "rootDir": "src",
    "types": ["node", "vscode"]
  },
  "include": ["src/host", "src/shared"]
}
```

`vscode-extension/tsconfig.webview.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "outDir": "out/webview",
    "rootDir": "src",
    "types": []
  },
  "include": ["src/webview", "src/shared"]
}
```

`vscode-extension/.vscodeignore`: `src/**`, `tsconfig*.json`, `node_modules/**`, `**/*.map`. `README.md`: three lines (what it is, settings, `npm run build`, F5). Add `out/` and `*.vsix` to the root `.gitignore`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/extension/state.test.ts` and `npx tsc --noEmit`
Expected: PASS; tsc clean (the root tsconfig pulls `shared/state.ts` through the test import; it must compile under `verbatimModuleSyntax`).

- [ ] **Step 5: Commit**

```bash
git add .gitignore vscode-extension tests/extension/state.test.ts
git commit -m "feat(vscode): extension scaffold and the state parser"
```

---

### Task 4: Text, scene model and polling gate (pure logic)

**Files:**
- Create: `vscode-extension/src/shared/text.ts`, `vscode-extension/src/shared/scene.ts`, `vscode-extension/src/shared/gate.ts`
- Test: `tests/extension/text.test.ts`, `tests/extension/scene.test.ts`, `tests/extension/gate.test.ts`

**Interfaces:**
- Consumes: `StateDoc`, `Lang` (Task 3).
- Produces:
  - `ui(lang: Lang, key: UiKey, vars?: Record<string, string | number>): string`, `UiKey`;
  - `statusBarText(doc: StateDoc | null, state: 'ok' | 'checking' | 'nodata'): string`, `statusBarTooltip(doc: StateDoc | null, error?: string): string`;
  - `type EffectKind = 'quest' | 'levelup' | 'boss_hit' | 'boss_defeated'`, `effectsBetween(prev: StateDoc | null, next: StateDoc): EffectKind[]`, `bossRatio(boss: {hp:number;max:number}): number` (0..1), `backgroundTier(level: number): 0 | 1 | 2`;
  - `createGate(): { run(job: () => Promise<void>): Promise<boolean>; readonly busy: boolean }`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/extension/text.test.ts
import { describe, expect, it } from 'vitest';
import { parseState } from '../../vscode-extension/src/shared/state.js';
import { statusBarText, statusBarTooltip, ui } from '../../vscode-extension/src/shared/text.js';

const doc = (over: Record<string, unknown> = {}) =>
  parseState({ version: 1, lang: 'en', level: 2, xp: { current: 475, forLevel: 500 }, title: 'APPRENTICE', ...over });

describe('status bar text', () => {
  it('shows level and xp, in the language of the document', () => {
    expect(statusBarText(doc(), 'ok')).toBe('⚔ LVL 2 · 475/500 XP');
    expect(statusBarText(doc({ lang: 'ru' }), 'ok')).toBe('⚔ УР. 2 · 475/500 XP');
  });
  it('shows MAX at the top level, a spinner while checking and no data without a document', () => {
    expect(statusBarText(doc({ level: 50, xp: { current: 120, forLevel: 500, max: true } }), 'ok')).toBe('⚔ LVL 50 · MAX');
    expect(statusBarText(doc(), 'checking')).toBe('$(sync~spin) CodeQuest: checking…');
    expect(statusBarText(null, 'nodata')).toBe('⚔ CodeQuest: no data');
  });
  it('puts title, class and boss into the tooltip, and the error when there is no document', () => {
    const tip = statusBarTooltip(doc({ class: { id: 'tester', name: 'Tester' }, boss: { id: 'x', name: 'Graveyard', hp: 5, max: 9 } }));
    expect(tip).toContain('APPRENTICE');
    expect(tip).toContain('Tester');
    expect(tip).toContain('Graveyard');
    expect(statusBarTooltip(null, 'boom')).toContain('boom');
  });
});

describe('ui strings', () => {
  it('have the same placeholders in both languages', () => {
    const keys = ['check', 'checking', 'noProject', 'owed', 'quests', 'noQuests', 'bossHp', 'noData'] as const;
    for (const key of keys) {
      const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(placeholders(ui('ru', key, {}))).toEqual(placeholders(ui('en', key, {})));
    }
  });
  it('fills placeholders', () => {
    expect(ui('en', 'owed', { xp: 60 })).toBe('+60 XP waiting for a green run');
  });
});
```
(`ui('ru', key, {})` must return the raw template when a var is missing — keep placeholders unfilled so the parity check sees them.)

```ts
// tests/extension/scene.test.ts
import { describe, expect, it } from 'vitest';
import { parseState } from '../../vscode-extension/src/shared/state.js';
import { backgroundTier, bossRatio, effectsBetween } from '../../vscode-extension/src/shared/scene.js';

const doc = (over: Record<string, unknown> = {}) => {
  const parsed = parseState({ version: 1, level: 3, quests: { done: 4 }, bossesActive: 0, ...over });
  if (parsed === null) throw new Error('bad doc');
  return parsed;
};

describe('effectsBetween', () => {
  it('fires nothing for the first document or for two equal ones', () => {
    expect(effectsBetween(null, doc())).toEqual([]);
    expect(effectsBetween(doc(), doc())).toEqual([]);
  });
  it('fires levelup and quest when they grow, never when they fall', () => {
    expect(effectsBetween(doc(), doc({ level: 4 }))).toEqual(['levelup']);
    expect(effectsBetween(doc(), doc({ quests: { done: 5 } }))).toEqual(['quest']);
    expect(effectsBetween(doc({ level: 4 }), doc({ level: 3 }))).toEqual([]);
    expect(effectsBetween(doc(), doc({ level: 4, quests: { done: 5 } }))).toEqual(['quest', 'levelup']);
  });
  it('fires boss_hit when the same boss loses hp and boss_defeated when the number of active bosses falls', () => {
    const boss = (hp: number, id = 'graveyard') => ({ id, name: id, hp, max: 9 });
    expect(effectsBetween(doc({ boss: boss(9), bossesActive: 1 }), doc({ boss: boss(6), bossesActive: 1 }))).toEqual(['boss_hit']);
    expect(effectsBetween(doc({ boss: boss(9), bossesActive: 1 }), doc({ boss: boss(12), bossesActive: 1 }))).toEqual([]);
    expect(effectsBetween(doc({ boss: boss(2), bossesActive: 1 }), doc({ bossesActive: 0 }))).toEqual(['boss_defeated']);
    expect(effectsBetween(doc({ boss: boss(2), bossesActive: 2 }), doc({ boss: boss(4, 'breach'), bossesActive: 1 }))).toEqual(['boss_defeated']);
  });
});

describe('bossRatio and backgroundTier', () => {
  it('keeps the ratio between 0 and 1', () => {
    expect(bossRatio({ hp: 5, max: 10 })).toBe(0.5);
    expect(bossRatio({ hp: 20, max: 10 })).toBe(1);
    expect(bossRatio({ hp: 0, max: 0 })).toBe(0);
  });
  it('has three tiers: 1–9, 10–29, 30–50', () => {
    expect([1, 9, 10, 29, 30, 50].map(backgroundTier)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});
```

```ts
// tests/extension/gate.test.ts
import { describe, expect, it } from 'vitest';
import { createGate } from '../../vscode-extension/src/shared/gate.js';

describe('createGate', () => {
  it('skips a job while another one is running and runs again after it', async () => {
    const gate = createGate();
    let release: () => void = () => {};
    const first = gate.run(() => new Promise<void>((resolve) => { release = resolve; }));
    expect(gate.busy).toBe(true);
    expect(await gate.run(async () => {})).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(gate.busy).toBe(false);
    expect(await gate.run(async () => {})).toBe(true);
  });
  it('is free again after a job that throws, and passes the error on', async () => {
    const gate = createGate();
    await expect(gate.run(async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(gate.busy).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/extension`
Expected: FAIL (modules not found) for text, scene and gate.

- [ ] **Step 3: Implement**

`gate.ts`:

```ts
/** One job at a time: a job that arrives while another runs is skipped (polling must not pile up). */
export function createGate(): { run(job: () => Promise<void>): Promise<boolean>; readonly busy: boolean } {
  let busy = false;
  return {
    get busy() {
      return busy;
    },
    async run(job) {
      if (busy) return false;
      busy = true;
      try {
        await job();
        return true;
      } finally {
        busy = false;
      }
    },
  };
}
```

`scene.ts`:

```ts
import type { StateDoc } from './state.js';

export type EffectKind = 'quest' | 'levelup' | 'boss_hit' | 'boss_defeated';

/** Which one-shot effects the change from `prev` to `next` deserves; nothing for the first document. */
export function effectsBetween(prev: StateDoc | null, next: StateDoc): EffectKind[] {
  if (prev === null) return [];
  const effects: EffectKind[] = [];
  if (next.quests.done > prev.quests.done) effects.push('quest');
  if (next.level > prev.level) effects.push('levelup');
  if (next.bossesActive < prev.bossesActive) effects.push('boss_defeated');
  else if (prev.boss !== null && next.boss !== null && prev.boss.id === next.boss.id && next.boss.hp < prev.boss.hp) {
    effects.push('boss_hit');
  }
  return effects;
}

export const bossRatio = (boss: { hp: number; max: number }): number =>
  boss.max <= 0 ? 0 : Math.min(1, Math.max(0, boss.hp / boss.max));

export const backgroundTier = (level: number): 0 | 1 | 2 => (level >= 30 ? 2 : level >= 10 ? 1 : 0);
```

`text.ts`:

```ts
import type { Lang, StateDoc } from './state.js';

const EN = {
  check: 'Check quest',
  checking: 'Checking…',
  noProject: 'Open a project folder to see CodeQuest.',
  noData: 'No data',
  owed: '+{xp} XP waiting for a green run',
  quests: 'In progress',
  noQuests: 'No quest taken yet',
  bossHp: 'HP {hp}/{max}',
  lvl: 'LVL',
} as const;
export type UiKey = keyof typeof EN;

const RU: Record<UiKey, string> = {
  check: 'Проверить квест',
  checking: 'Проверяю…',
  noProject: 'Откройте папку проекта, чтобы увидеть CodeQuest.',
  noData: 'Нет данных',
  owed: '+{xp} XP ждут зелёного прогона',
  quests: 'В работе',
  noQuests: 'Квест ещё не взят',
  bossHp: 'HP {hp}/{max}',
  lvl: 'УР.',
};

/** A catalog text; a placeholder without a value stays as it is. */
export function ui(lang: Lang, key: UiKey, vars: Record<string, string | number> = {}): string {
  const template = (lang === 'ru' ? RU : EN)[key];
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

export function statusBarText(doc: StateDoc | null, state: 'ok' | 'checking' | 'nodata'): string {
  if (state === 'checking') return '$(sync~spin) CodeQuest: checking…';
  if (doc === null || state === 'nodata') return '⚔ CodeQuest: no data';
  const lvl = ui(doc.lang, 'lvl');
  return doc.xp.max
    ? `⚔ ${lvl} ${doc.level} · MAX`
    : `⚔ ${lvl} ${doc.level} · ${doc.xp.current}/${doc.xp.forLevel} XP`;
}

export function statusBarTooltip(doc: StateDoc | null, error?: string): string {
  if (doc === null) return error ?? 'CodeQuest';
  const lines = [`${doc.title} · ${doc.project.name}`];
  if (doc.class !== null) lines.push(doc.class.name);
  if (doc.boss !== null) lines.push(`${doc.boss.name} ${ui(doc.lang, 'bossHp', { hp: doc.boss.hp, max: doc.boss.max })}`);
  if (error !== undefined) lines.push(error);
  return lines.join('\n');
}
```

Note: the `lvl` key is an extra UI key; the placeholder-parity test only lists the keys it names, so it stays valid.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/extension` and `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add vscode-extension/src/shared tests/extension
git commit -m "feat(vscode): status text, scene model and polling gate"
```

---

### Task 5: Sprites and the scene renderer

**Files:**
- Create: `vscode-extension/src/shared/sprites.ts`, `vscode-extension/src/shared/draw.ts`
- Test: `tests/extension/sprites.test.ts`, `tests/extension/draw.test.ts`

**Interfaces:**
- Consumes: `bossRatio`, `backgroundTier`, `EffectKind` (Task 4), `StateDoc` (Task 3).
- Produces:
  - `sprites.ts`: `type Sprite = { rows: string[]; palette: Record<string, string> }`, `heroSprite(classId: string | null): Sprite`, `bossSprite(id: string): Sprite`, `CLASS_IDS`, `BOSS_IDS`, `mirror(half: string[]): string[]`.
  - `draw.ts`: `interface Ctx2D { fillStyle: string; fillRect(x: number, y: number, w: number, h: number): void; clearRect(x: number, y: number, w: number, h: number): void }`, `SCENE_W = 160`, `SCENE_H = 64`, `drawScene(ctx: Ctx2D, input: SceneInput, time: number): void`, `interface SceneInput { doc: StateDoc | null; effects: { kind: EffectKind; startedAt: number }[] }`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/extension/sprites.test.ts
import { describe, expect, it } from 'vitest';
import { BOSS_IDS, bossSprite, CLASS_IDS, heroSprite, mirror } from '../../vscode-extension/src/shared/sprites.js';

const check = (sprite: { rows: string[]; palette: Record<string, string> }) => {
  const width = sprite.rows[0]?.length ?? 0;
  expect(width).toBeGreaterThan(0);
  for (const row of sprite.rows) {
    expect(row).toHaveLength(width);
    for (const key of row) if (key !== '.') expect(sprite.palette[key], `key ${key}`).toBeDefined();
  }
  for (const color of Object.values(sprite.palette)) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
};

describe('sprites', () => {
  it('mirror doubles a half row', () => {
    expect(mirror(['ab..'])).toEqual(['ab....ba']);
  });
  it('every hero (six classes and the neutral one) is a rectangle over its palette', () => {
    expect(CLASS_IDS).toEqual(['architect', 'tester', 'guardian', 'optimizer', 'cleaner', 'bug-hunter']);
    for (const id of [...CLASS_IDS, null, 'unknown-class']) check(heroSprite(id));
  });
  it('heroes of different classes look different', () => {
    const rows = new Set(CLASS_IDS.map((id) => heroSprite(id).rows.join('|') + JSON.stringify(heroSprite(id).palette)));
    expect(rows.size).toBe(CLASS_IDS.length);
  });
  it('every boss theme and the generic one is a rectangle over its palette', () => {
    expect(BOSS_IDS).toEqual(['dark-forest', 'graveyard', 'clone-army', 'secret-leak', 'blind-spots', 'breach', 'todo-swamp']);
    for (const id of [...BOSS_IDS, 'from-the-future']) check(bossSprite(id));
  });
});
```

```ts
// tests/extension/draw.test.ts
import { describe, expect, it } from 'vitest';
import { type Ctx2D, drawScene, SCENE_H, SCENE_W } from '../../vscode-extension/src/shared/draw.js';
import { parseState } from '../../vscode-extension/src/shared/state.js';

function recorder() {
  const calls: { color: string; x: number; y: number; w: number; h: number }[] = [];
  const ctx: Ctx2D = {
    fillStyle: '#000000',
    fillRect(x, y, w, h) {
      calls.push({ color: this.fillStyle, x, y, w, h });
    },
    clearRect() {},
  };
  return { ctx, calls };
}
const doc = (over: Record<string, unknown> = {}) => parseState({ version: 1, level: 3, ...over });

describe('drawScene', () => {
  it('draws only inside the scene, for every tier and with or without a document', () => {
    for (const input of [
      { doc: null, effects: [] },
      { doc: doc(), effects: [] },
      { doc: doc({ level: 12, class: { id: 'tester', name: 'T' } }), effects: [] },
      { doc: doc({ level: 40, boss: { id: 'breach', name: 'B', hp: 3, max: 5 }, bossesActive: 1 }), effects: [] },
    ]) {
      const { ctx, calls } = recorder();
      drawScene(ctx, input, 1234);
      expect(calls.length).toBeGreaterThan(10);
      for (const c of calls) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w).toBeLessThanOrEqual(SCENE_W);
        expect(c.y + c.h).toBeLessThanOrEqual(SCENE_H);
      }
    }
  });

  it('draws more with a boss than without, and effects add pixels without leaving the scene', () => {
    const plain = recorder();
    drawScene(plain.ctx, { doc: doc(), effects: [] }, 0);
    const withBoss = recorder();
    drawScene(withBoss.ctx, { doc: doc({ boss: { id: 'graveyard', name: 'G', hp: 4, max: 8 }, bossesActive: 1 }), effects: [] }, 0);
    expect(withBoss.calls.length).toBeGreaterThan(plain.calls.length);
    const fx = recorder();
    drawScene(fx.ctx, { doc: doc(), effects: [{ kind: 'levelup', startedAt: 0 }, { kind: 'quest', startedAt: 0 }] }, 200);
    expect(fx.calls.length).toBeGreaterThan(plain.calls.length);
    for (const c of fx.calls) expect(c.x + c.w).toBeLessThanOrEqual(SCENE_W);
  });

  it('shows a finished effect as nothing', () => {
    const base = recorder();
    drawScene(base.ctx, { doc: doc(), effects: [] }, 5000);
    const old = recorder();
    drawScene(old.ctx, { doc: doc(), effects: [{ kind: 'levelup', startedAt: 0 }] }, 5000);
    expect(old.calls.length).toBe(base.calls.length);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/extension/sprites.test.ts tests/extension/draw.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `sprites.ts`**

```ts
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

export function heroSprite(classId: string | null): Sprite {
  const colors = (classId !== null && HERO_COLORS[classId]) || NEUTRAL;
  const emblem = classId !== null ? EMBLEMS[classId] : undefined;
  const rows = HERO_ROWS.map((row, y) => {
    const line = emblem?.[y - 6];
    if (line === undefined) return row;
    return row.slice(0, 3) + line + row.slice(6);
  });
  return {
    rows,
    palette: { o: '#1b1b1b', h: colors.h, s: '#f1c7a1', e: '#222222', b: colors.b, l: '#3a3f55', a: colors.a },
  };
}

// Bosses 12×10, written as left halves of 6 columns: a main, b second, o outline, e eye.
const BOSS_HALVES: Record<string, { half: string[]; a: string; b: string }> = {
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
const GENERIC_BOSS = {
  half: ['..oooo', '.oaaaa', 'oaaaaa', 'oaeaaa', 'oaaaaa', 'oaaoaa', 'oaaaaa', '.oaaaa', '..oooo', '......'],
  a: '#7c7c7c',
  b: '#4a4a4a',
};

export function bossSprite(id: string): Sprite {
  const def = BOSS_HALVES[id] ?? GENERIC_BOSS;
  return { rows: mirror(def.half), palette: { o: '#1b1b1b', e: '#ff4040', a: def.a, b: def.b } };
}
```
`BOSS_HALVES[id]` for ids like `constructor` — use `Object.hasOwn(BOSS_HALVES, id) ? BOSS_HALVES[id] : undefined`; same for `HERO_COLORS` and `EMBLEMS` (unknown ids from newer versions must not hit `Object.prototype`). Write it that way.

- [ ] **Step 4: Implement `draw.ts`**

```ts
import type { EffectKind } from './scene.js';
import { backgroundTier, bossRatio } from './scene.js';
import { bossSprite, heroSprite, type Sprite } from './sprites.js';
import type { StateDoc } from './state.js';

export const SCENE_W = 160;
export const SCENE_H = 64;
const GROUND = 52;
export const EFFECT_MS = 1200;

export interface Ctx2D {
  fillStyle: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
}

export interface SceneInput {
  doc: StateDoc | null;
  effects: { kind: EffectKind; startedAt: number }[];
}

const TIERS = [
  { sky: '#9bd1f2', far: '#7fb069', near: '#4f8a3c', trunk: '#6b4a2b', leaf: '#3f7d34' },
  { sky: '#e9b872', far: '#b9803a', near: '#8a5a2b', trunk: '#5a3b1e', leaf: '#c9792b' },
  { sky: '#2b2540', far: '#4a3f6b', near: '#2f2a4a', trunk: '#241f38', leaf: '#6b5aa8' },
] as const;

function pixel(ctx: Ctx2D, color: string, x: number, y: number, w = 1, h = 1): void {
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(SCENE_W, Math.floor(x + w));
  const bottom = Math.min(SCENE_H, Math.floor(y + h));
  if (right <= left || bottom <= top) return;
  ctx.fillStyle = color;
  ctx.fillRect(left, top, right - left, bottom - top);
}

function blit(ctx: Ctx2D, sprite: Sprite, x: number, y: number, flip = false): void {
  sprite.rows.forEach((row, dy) => {
    const cells = flip ? [...row].reverse() : [...row];
    cells.forEach((key, dx) => {
      const color = key === '.' ? undefined : sprite.palette[key];
      if (color !== undefined) pixel(ctx, color, x + dx, y + dy);
    });
  });
}

function background(ctx: Ctx2D, tier: 0 | 1 | 2): void {
  const c = TIERS[tier];
  pixel(ctx, c.sky, 0, 0, SCENE_W, SCENE_H);
  pixel(ctx, c.far, 0, 38, SCENE_W, 14);
  pixel(ctx, c.near, 0, GROUND, SCENE_W, SCENE_H - GROUND);
  for (const x of [8, 40, 96, 128]) {
    pixel(ctx, c.trunk, x + 3, 30, 3, 22);
    pixel(ctx, c.leaf, x, 20, 9, 12);
  }
}

/** One frame of the scene; `time` is in milliseconds. Pure drawing: no state, no DOM. */
export function drawScene(ctx: Ctx2D, input: SceneInput, time: number): void {
  const { doc } = input;
  background(ctx, backgroundTier(doc?.level ?? 1));
  const step = Math.floor(time / 250);
  const bob = step % 2;
  const hero = heroSprite(doc?.class?.id ?? null);
  const heroX = 30 + (doc !== null && doc.boss === null ? (step % 8) * 2 : 0);
  blit(ctx, hero, heroX, GROUND - 14 - bob);
  if (doc?.boss != null) {
    const boss = doc.boss;
    blit(ctx, bossSprite(boss.id), 104, GROUND - 10 + bob, true);
    pixel(ctx, '#1b1b1b', 102, 30, 34, 4);
    pixel(ctx, '#d94a4a', 103, 31, Math.round(32 * bossRatio(boss)), 2);
  }
  for (const effect of input.effects) {
    const age = time - effect.startedAt;
    if (age < 0 || age >= EFFECT_MS) continue;
    const t = age / EFFECT_MS;
    if (effect.kind === 'levelup') {
      for (let i = 0; i < 6; i++) pixel(ctx, '#ffe066', heroX + 2 + i * 2, GROUND - 18 - Math.round(t * 14) - (i % 2) * 3, 2, 2);
    } else if (effect.kind === 'quest') {
      for (let i = 0; i < 5; i++) pixel(ctx, '#7CFC9A', heroX - 2 + i * 3, GROUND - 4 - Math.round(t * 10) + (i % 2) * 2, 1, 2);
    } else if (effect.kind === 'boss_hit' && Math.floor(age / 120) % 2 === 0) {
      pixel(ctx, '#ffffff', 104, GROUND - 10, 12, 10);
    } else if (effect.kind === 'boss_defeated') {
      for (let i = 0; i < 8; i++) pixel(ctx, '#ff9f43', 104 + i * 2, GROUND - 4 - Math.round(t * 18) - (i % 3) * 2, 2, 2);
    }
  }
}
```
Notes: `heroX` max = 30 + 14 = 44, hero width 10 → within the scene. Boss at x=104, width 12, y ≤ 52 → inside. Run the tests; fix coordinates that leave the scene (the `pixel` clamp already keeps everything inside; the test then checks the clamp).

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/extension` and `npx tsc --noEmit`
Expected: PASS. If `doc?.boss != null` trips Biome (`noDoubleEquals` allows `!= null`? it flags it), write `doc !== null && doc.boss !== null`.

- [ ] **Step 6: Commit**

```bash
git add vscode-extension/src/shared tests/extension
git commit -m "feat(vscode): pixel sprites and the scene renderer"
```

---

### Task 6: CLI runner, panel HTML, webview UI and host glue

**Files:**
- Create: `vscode-extension/src/host/cli.ts`, `vscode-extension/src/host/html.ts`, `vscode-extension/src/host/extension.ts`, `vscode-extension/src/webview/main.ts`
- Test: `tests/extension/cli.test.ts`, `tests/extension/html.test.ts`

**Interfaces:**
- Consumes: `parseCliOutput` (Task 3), `createGate`, `statusBarText`, `statusBarTooltip`, `ui`, `effectsBetween`, `drawScene`, `SCENE_W`, `SCENE_H`.
- Produces:
  - `host/cli.ts`: `runCodeQuest(options: { node: string; cli: string; home: string; args: string[]; cwd: string; timeoutMs?: number }): Promise<CliResult>` (never rejects).
  - `host/html.ts`: `panelHtml(options: { cspSource: string; nonce: string; scriptUri: string }): string`.
  - Message protocol: host → webview `{type:'state', doc: StateDoc}`, `{type:'busy', on: boolean}`, `{type:'error', message: string, lang: 'en'|'ru'}`, `{type:'empty', lang}` (no workspace); webview → host `{type:'ready'}`, `{type:'verify'}`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/extension/cli.test.ts
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runCodeQuest } from '../../vscode-extension/src/host/cli.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

async function fakeCli(body: string): Promise<string> {
  const dir = await makeTempDir();
  const file = path.join(dir, 'fake cli.mjs');
  await mkdir(dir, { recursive: true });
  await writeFile(file, body);
  return file;
}
const doc = JSON.stringify({ version: 1, level: 7 });

describe('runCodeQuest', () => {
  it('passes args as an array (spaces, Cyrillic) and CODEQUEST_HOME, and parses the document', async () => {
    const cli = await fakeCli(
      `const [, , cmd, flag, value] = process.argv; console.log(JSON.stringify({ version: 1, level: cmd === 'state' && flag === '--path' && value === 'D:/проект 1/a b' && process.env.CODEQUEST_HOME === 'D:/home x' ? 7 : 1 }));`,
    );
    const result = await runCodeQuest({ node: process.execPath, cli, home: 'D:/home x', args: ['state', '--path', 'D:/проект 1/a b'], cwd: process.cwd() });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.level).toBe(7);
  });

  it('turns a non-zero exit with an error document into its message', async () => {
    const cli = await fakeCli(`console.log(JSON.stringify({ error: { key: 'k', message: 'No project' } })); process.exit(1);`);
    expect(await runCodeQuest({ node: process.execPath, cli, home: 'x', args: ['state'], cwd: process.cwd() })).toEqual({ ok: false, message: 'No project' });
  });

  it('never rejects: a missing node, a crash and a timeout become messages', async () => {
    const missing = await runCodeQuest({ node: 'D:/no/such/node.exe', cli: 'x', home: 'x', args: [], cwd: process.cwd() });
    expect(missing.ok).toBe(false);
    const crash = await fakeCli(`throw new Error('boom');`);
    const crashed = await runCodeQuest({ node: process.execPath, cli: crash, home: 'x', args: ['state'], cwd: process.cwd() });
    expect(crashed.ok).toBe(false);
    const slow = await fakeCli(`setTimeout(() => console.log(${JSON.stringify(doc)}), 5000);`);
    const timedOut = await runCodeQuest({ node: process.execPath, cli: slow, home: 'x', args: ['state'], cwd: process.cwd(), timeoutMs: 300 });
    expect(timedOut.ok).toBe(false);
    if (!timedOut.ok) expect(timedOut.message).toMatch(/timed out|too long|did not finish/i);
  });
});
```

```ts
// tests/extension/html.test.ts
import { describe, expect, it } from 'vitest';
import { panelHtml } from '../../vscode-extension/src/host/html.js';

describe('panelHtml', () => {
  const html = panelHtml({ cspSource: 'vscode-webview://abc', nonce: 'N0NCE', scriptUri: 'vscode-webview://abc/main.js' });
  it('allows only the nonce script and the webview source, no remote content', () => {
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'nonce-N0NCE'");
    expect(html).toContain('<script type="module" nonce="N0NCE" src="vscode-webview://abc/main.js">');
    expect(html).not.toMatch(/https?:\/\//);
  });
  it('has the canvas, the check button and the containers the UI script fills', () => {
    for (const id of ['scene', 'check', 'bars', 'quests', 'message']) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('image-rendering: pixelated');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/extension/cli.test.ts tests/extension/html.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `host/cli.ts` and `host/html.ts`**

```ts
// vscode-extension/src/host/cli.ts
import { execFile } from 'node:child_process';
import { type CliResult, parseCliOutput } from '../shared/state.js';

export interface RunOptions {
  node: string;
  cli: string;
  home: string;
  args: string[];
  cwd: string;
  /** Default 30 s; the check button passes none: CodeQuest enforces the timeout of the project commands itself. */
  timeoutMs?: number;
}

/** Runs `node <cli> <args>` with an argument array (no shell). Never rejects. */
export function runCodeQuest(options: RunOptions): Promise<CliResult> {
  return new Promise((resolve) => {
    const timeout = options.timeoutMs ?? 30_000;
    execFile(
      options.node,
      [options.cli, ...options.args],
      { cwd: options.cwd, env: { ...process.env, CODEQUEST_HOME: options.home }, timeout, windowsHide: true, maxBuffer: 8_000_000 },
      (error, stdout, stderr) => {
        if (error !== null && 'killed' in error && error.killed) {
          resolve({ ok: false, message: 'CodeQuest did not finish in time (timed out)' });
          return;
        }
        const parsed = parseCliOutput(stdout);
        if (parsed.ok || stdout.trim() !== '') {
          resolve(parsed);
          return;
        }
        const detail = (stderr.trim() || (error?.message ?? '')).split('\n').find((line) => line.trim() !== '');
        resolve({ ok: false, message: detail === undefined ? parsed.message : `CodeQuest failed: ${detail.trim().slice(0, 200)}` });
      },
    );
  });
}
```
(`parsed.message` is only reached when `parsed.ok` is false; narrow with `if (!parsed.ok)` to satisfy tsc.)

`host/html.ts`:

```ts
export interface PanelHtmlOptions {
  cspSource: string;
  nonce: string;
  scriptUri: string;
}

/** The page of the webview: a locked-down CSP (only the nonce script, inline styles) and the containers `main.ts` fills. */
export function panelHtml({ cspSource, nonce, scriptUri }: PanelHtmlOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; padding: 0 0 8px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); }
  #scene { display: block; width: 100%; height: auto; aspect-ratio: 160 / 64; image-rendering: pixelated; }
  .pad { padding: 6px 10px; }
  .row { display: flex; align-items: center; gap: 6px; margin: 2px 0; font-size: 11px; }
  .row .name { width: 92px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar { flex: 1; height: 6px; background: var(--vscode-progressBar-background, #444); opacity: .35; border-radius: 3px; position: relative; }
  .bar > i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; opacity: 1; background: var(--vscode-progressBar-background, #0e70c0); }
  .bar.boss > i { background: #d94a4a; }
  #title { font-weight: 600; margin-bottom: 4px; }
  button { width: 100%; margin-top: 8px; padding: 6px; border: 0; cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: .6; cursor: default; }
  #quests { margin: 6px 0 0; padding-left: 16px; font-size: 11px; }
  #message { font-size: 11px; opacity: .85; }
  .hint { font-size: 11px; opacity: .8; margin-top: 4px; }
</style>
</head>
<body>
<canvas id="scene" width="160" height="64"></canvas>
<div class="pad">
  <div id="title"></div>
  <div id="bars"></div>
  <div id="quests"></div>
  <div class="hint" id="owed"></div>
  <button id="check" type="button"></button>
  <div id="message"></div>
</div>
<script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
```
`#quests` is a `<div>` holding a `<ul>` built by the script; fix the CSS accordingly.

- [ ] **Step 4: Implement the webview UI (`src/webview/main.ts`)**

Behaviour (write the real code, about 120 lines):
- `acquireVsCodeApi()` (declare it: `declare function acquireVsCodeApi(): { postMessage(message: unknown): void };`), post `{type:'ready'}`.
- State: `doc: StateDoc | null`, `effects: {kind, startedAt}[]`, `busy`, `visible`.
- On `message` `{type:'state'}`: `const fresh = effectsBetween(doc, next).map(kind => ({kind, startedAt: performance.now()}))`; push to `effects` (drop finished ones older than `EFFECT_MS`); set `doc = next`; render DOM.
- Render: title (`#title`: `${doc.title} · ${doc.class?.name ?? ''}`), nine stat bars (label via a small `STAT_LABEL` map per language inside `main.ts`; class stats are not in the document, so no ★ in this stage: note it in the README as not done), boss HP bar when `doc.boss`, quest list from `quests.inProgress` (or `ui(lang,'noQuests')`), `#owed` text when `owed.count > 0`, button text `ui(lang, busy ? 'checking' : 'check')`, disabled while `busy`.
- DOM is built with `textContent` and `createElement` only (never `innerHTML` with document data).
- Animation loop: `setInterval` every 125 ms (8 fps) calling `drawScene(ctx, {doc, effects}, performance.now())`; started only while `document.visibilityState === 'visible'` and `matchMedia('(prefers-reduced-motion: reduce)')` is false (then draw one frame per state change). Stop on `visibilitychange` hidden.
- `{type:'busy'}` sets `busy`; `{type:'error'}` shows the message in `#message` and keeps the last scene; `{type:'empty'}` shows `ui(lang,'noProject')`.
- Button click posts `{type:'verify'}`.

- [ ] **Step 5: Implement the host glue (`src/host/extension.ts`)**

Behaviour (write the real code, about 150 lines; checked by hand, not unit tested):
- `activate(context)`: create `vscode.window.createStatusBarItem(Left, 100)` with command `codequest.verify`; register `WebviewViewProvider` for `codequest.panel` with `enableScripts: true`, `localResourceRoots: [Uri.joinPath(extensionUri, 'out')]`, HTML from `panelHtml` (nonce = random 16 hex, `scriptUri = webview.asWebviewUri(Uri.joinPath(extensionUri, 'out', 'webview', 'webview', 'main.js'))`).
- `config()` reads `codequest.*` settings; `workspaceRoot()` = first workspace folder `uri.fsPath` or `undefined`.
- `refresh()`: no workspace → post `{type:'empty'}` and status bar `no data`; else `gate.run` → `runCodeQuest({args: ['state', '--path', root], ...})`; on ok post `state` and update status bar text/tooltip; on failure post `error`, status bar `nodata` with the message in the tooltip. The previous document stays in the webview.
- `verify()`: separate `verifyGate`; set status `checking`, post `{busy:true}`; run `verify --json --path root` with no timeout; on ok post `state` + `{busy:false}` and `showInformationMessage(\`CodeQuest: ${doc.title}, LVL ${doc.level}\`)`; on failure `showWarningMessage(message)`. While verifying the polling `refresh` is skipped (check `verifyGate.busy`).
- Polling: `setInterval(refresh, max(10, pollSeconds) * 1000)`; started when the view is visible or the status bar is shown (always, so the status bar works even with the panel closed; skip the tick when `vscode.window.state.focused` is false); also call `refresh` on `onDidChangeWorkspaceFolders`, `onDidChangeWindowState` (focused), `onDidChangeConfiguration`, and when the webview sends `ready`.
- Commands `codequest.verify`, `codequest.refresh`. Dispose everything via `context.subscriptions`.

- [ ] **Step 6: Ask before installing dev dependencies — STOP**

Ask the user: "Установить в `D:\Claude\rpg game-code\vscode-extension` пакеты `@types/vscode` и `@vscode/vsce` (нужны, чтобы собрать расширение; на диск D, на C ничего)?" Do not continue to Step 7 without a yes. Run `npm install` inside `vscode-extension` only after the yes.

- [ ] **Step 7: Build and run all checks**

Run: `npx vitest run tests/extension`, then in `vscode-extension`: `npm run build`, then in the repo root `npm run check`.
Expected: tests PASS; both tsc builds clean; `vscode-extension/out/host/extension.js` and `vscode-extension/out/webview/webview/main.js` exist; root check green. If the host output is ESM (`import` syntax) instead of CommonJS, set `"type": "commonjs"` in `vscode-extension/package.json` and rebuild; ledger it as a ruling.

- [ ] **Step 8: Commit**

```bash
git add vscode-extension tests/extension
git commit -m "feat(vscode): CLI runner, panel page, webview UI and host"
```

---

### Task 7: Manual check in the Extension Development Host (by the user)

**Files:**
- Create: `vscode-extension/.vscode/launch.json` is NOT created (the repo ignores `.vscode/`); instead the README gets the exact steps.

- [ ] **Step 1: Write the steps into `vscode-extension/README.md`**

How to try it without installing: open the folder `D:\Claude\rpg game-code\vscode-extension` in VS Code, press F5 ("Run Extension"; if VS Code asks for a launch config, choose "VS Code Extension Development"), a second window opens; open a project folder there; the panel "CodeQuest" is in the Explorer under "Timeline"; the status bar shows `⚔ LVL …`.

- [ ] **Step 2: Hand over to the user**

Tell the user the steps and what to look at: the scene draws, the bars match `codequest hud`, the button runs a check and the status bar spins, the panel pauses when hidden (Task Manager CPU stays low), switching VS Code theme keeps text readable. Collect their findings; fix problems as small commits (each with a test when the cause is pure logic).

- [ ] **Step 3: Commit**

```bash
git add vscode-extension/README.md
git commit -m "docs(vscode): how to try the extension"
```

---

### Task 8: Package, docs, memory, final review

**Files:**
- Modify: `ПЛАН.md` (status of phase 3 stage 1), `docs/superpowers/specs/2026-10-02-codequest-vscode-panel-design.md` (apply the three rulings of this plan to section 3)
- Memory: update `project_codequest_mcp.md`

- [ ] **Step 1: Apply the rulings to the spec** (`recent` removed, `quests.done` and `xp.max` added, `class.secondary`), commit.

- [ ] **Step 2: Package** (needs Task 6's dev dependencies): `npm run package` in `vscode-extension` produces `codequest-vscode-0.1.0.vsix` on drive D. Do NOT install it. Ask the user whether to install it into their VS Code (`code --install-extension`), a change of their configuration: STOP and wait for a yes.

- [ ] **Step 3: Update `ПЛАН.md` and memory** with: stage 1 done, how to run (F5 or .vsix), the CLI `state --json`, the open items (class stars on stat bars postponed; dashboard, map, analytics are stages 2–4).

- [ ] **Step 4: Final check and review**

Run: `npm run check` (root, in background, 3–5 min). Then one independent reviewer over the whole stage (the user asked for reviewers on request, so offer it; do not start it unasked).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: phase 3 stage 1 done"
```
