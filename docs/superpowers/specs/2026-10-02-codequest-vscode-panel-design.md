# CodeQuest — VS Code panel (phase 3, stage 1)

Phase 3 is split into four stages, each with its own spec, plan and implementation:
1. **VS Code panel** (this document): pixel scene, level/XP bars, check button, status bar item.
2. Dashboard (a webview tab with XP chart, stats, history, achievements, bosses).
3. Project map (`get_project_map`: folders and files with problems and quests).
4. Analytics (stat trends, XP pace from the journal).

## 1. Goal and success criteria

The user sees their progress all the time without asking Claude: a panel in the Explorer sidebar (like "VS Code Pets")
with a living pixel scene, and a status bar item. Success:
- the panel and the status bar show the real level, XP and stats of the open project, refreshed on their own;
- a button runs the same check as `verify_quest_completion`, without freezing VS Code;
- the hero depends on the project class, the boss on the active boss theme, with its HP bar;
- a finished quest or a level-up is visible as a short animation;
- nothing is installed on drive C; the user installs the extension themselves, after an explicit yes.

Out of scope here: dashboard, map, analytics, sound, editing settings from the panel, publishing to the Marketplace.

## 2. Architecture

```
VS Code (extension host, Node)         CodeQuest (this repo)
  extension.ts ── spawn ──────────────▶ node dist/cli/index.js state --json --path <workspace>
       │                               node dist/cli/index.js verify --json --path <workspace>
       └─ postMessage ─▶ webview (canvas scene, bars, button)
```

- The extension is a thin client. All game logic stays in the CodeQuest core; the extension never reads the journal.
- New CLI command **`state --json`**: prints one JSON document (section 3) on stdout, nothing else. It runs the cached
  fast path (`engine.view`), never project commands.
- New flag **`--json`** for `verify`: same document, produced after `engine.verify` (runs project commands, up to the
  project's timeout, default 900 s).
- Errors: exit code 1 and `{ "error": { "key", "message" } }` on stdout when `--json` is set (message in the user's
  language). The extension shows it in the panel, never as a modal.

## 3. The `state --json` document (version 1)

```
{ version: 1, lang, project: { name, path },
  level, xp: { current, forLevel }, title,            // title: hudTitle(level, lang)
  stats: { architecture, testing, security, performance, cleanCode, bugs, ... }  // the nine, 0..100
  class: { id, name } | null,
  busy: boolean,                                       // a verification is running
  owed: { count, xp },
  quests: { open: n, inProgress: [{ id, title, difficulty }] },   // inProgress max 5
  boss: { id, name, hp, max } | null,                  // the first active boss by the order of the registry
  bossesActive: n,
  recent: [{ type, at }]                               // last events of this cycle: quest_completed, level_up, boss_*
}
```
Unknown ids from newer versions are passed through; the panel shows them by id with a generic sprite. Missing or
wrong-typed fields count as 0 / null (same rule as the rest of the core).

## 4. The extension (`vscode-extension/`)

- Own `package.json` and `tsconfig`, built with `tsc` into `vscode-extension/out/`; packaged by `@vscode/vsce` into a
  `.vsix` on drive D. No bundler. Dev dependencies live in `vscode-extension/node_modules` (D).
- Contributes: view `codequest.panel` in the Explorer container (webview view), commands `codequest.verify`,
  `codequest.refresh`, a status bar item.
- **Settings:** `codequest.cliPath` (default `D:\Claude\rpg game-code\dist\cli\index.js`), `codequest.home`
  (default `D:\Claude\codequest-data`), `codequest.pollSeconds` (default 30, minimum 10).
- **Polling:** every `pollSeconds` while the panel or status bar is visible, plus on workspace change and on window
  focus. One call at a time; a call that is still running skips the next tick. Process timeout 30 s for `state`.
- **Status bar:** `⚔ LVL 2 · 475/500 XP` (language of CodeQuest); tooltip: title, class, boss. Click = `codequest.verify`.
  While verifying: `$(sync~spin) CodeQuest: checking…`. When CodeQuest is not found or fails: `⚔ CodeQuest: no data`
  with the reason in the tooltip.
- **Verify:** spawns `verify --json` (no timeout of its own: CodeQuest enforces the project's), panel shows
  "checking…", buttons disabled. When done, the new state is shown and an information message lists the notification
  lines already printed by CodeQuest (not duplicated by the extension).
- No workspace folder: panel shows "open a project folder".

## 5. The scene (webview)

- One `<canvas>`, logical size 160×64 px, scaled by an integer factor with `image-rendering: pixelated`; follows the
  VS Code theme variables for text, bars and buttons, so it works in dark and light themes.
- **Sprites are drawn in code**: palette-indexed matrices (strings), no image files, no third-party art.
  - hero: 6 classes (palette and accessory per class), a neutral hero while the class is `null`;
  - bosses: 7 themes, a generic sprite for unknown ids;
  - background: 3 tiers by level (1–9, 10–29, 30–50) built from simple layers (sky, hills, trees).
- **Animation:** requestAnimationFrame limited to 8 fps; hero idle/walk; boss idle; one-shot effects: `quest`
  (sparks), `levelup` (flash + rising text), `boss_hit` (blink), `boss_defeated` (boss fades). An effect starts when a
  new state arrives whose `recent` list holds an event the previous state did not.
- The loop is stopped when the view is not visible (`onDidChangeVisibility`) and when the user's
  `prefers-reduced-motion` is set (then the scene is a still frame).
- Below the canvas: level title, XP bar, nine stat bars (compact, class stats marked ★), the boss HP bar when a boss is
  active, the quest list (max 5), the button "Check quest" (+ "+N XP owed" hint when `owed.count > 0`).
- Strings: ru and en catalogs inside the extension; the language comes from the `state` document.

## 6. Testing

- Core (vitest, in this repo): the `state` document builder as a pure function (levels, no class, no boss, wrong-typed
  data, unknown boss id, busy view, ru/en); the CLI `state --json` and `verify --json` through `runCli` with a fake
  engine, including the error document and exit code.
- Extension pure logic (vitest, no VS Code API): scene model (which sprite, HP ratio, which effect fires for which
  `recent` diff, no effect on the first state), formatting of the status bar text, polling gate (no overlap), sprite
  matrices are rectangular and use only palette keys.
- Extension host glue (`extension.ts`) is kept minimal and is not unit tested; it is checked by hand in the Extension
  Development Host (F5) and the result is reported honestly.
- `npm run check` of the core stays green; the extension has its own `npm run check` (tsc + biome + vitest).

## 7. Risks and decisions

- A call to the CLI takes about one second (Node start + cached path). Polling every 30 s is cheap; the scene itself
  does not poll.
- The webview cannot call Node; everything goes through `postMessage` with a typed message set
  (`state`, `busy`, `error`, `verify`).
- Windows: the path and the workspace may contain spaces and Cyrillic; the CLI is spawned with an argument array
  (no shell), never a joined string.
- Installing the `.vsix` is a change of the user's VS Code: not done without a separate yes. Dev mode (F5) needs no
  install.
