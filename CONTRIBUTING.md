# Contributing / Участие в проекте

Issues and pull requests are welcome, in English or Russian.
Замечания и pull request'ы приветствуются, на русском или английском.

## Setup

```bash
git clone https://github.com/aleks-fw/rpg-game-code.git
cd rpg-game-code
npm ci
npm run check      # typecheck + lint + tests, about 4 minutes
npm run build      # the MCP server runs the built dist/
```

Node.js 22.12+. Stop a running MCP server before you rebuild and restart it afterwards.

## Adding or changing a scanner rule

Rules live in `src/analyzer/rules/`, one file per rule, and are listed in `src/analyzer/rules/index.ts` (rule ids look
like `generic/todo`, `js/eval`, `bot/no-timeout`). A rule returns findings with a stable `key`, so the same problem keeps the same ID between runs.

1. **Write the fixtures first.** `tests/fixtures/rules/<pack>.<rule>/bad` (for example `generic.hardcoded-secret`) has the deliberate problem, `good` is a clean
   project that must give no findings.
2. **Write the test**, run it, and watch it fail for the right reason.
3. **Implement the rule**, then run the whole suite.
4. If the rule belongs to a boss theme, add it to the catalog in `src/game/bosses.ts`. A rule that can fail must never
   look like "no findings".

Texts go to both catalogs: `src/i18n/en.ts` and `src/i18n/ru.ts` (reasons and finding messages in `reasons-*.ts`).
A test (`tests/i18n/i18n.test.ts`) fails if a language has keys that English lacks.

## False positives

A rule that cries wolf is worse than no rule. If you find a false positive, add a small fixture that reproduces it
and a test asserting there are no findings, then fix the rule. Prefer measurable rules over guesses.

## Rules of thumb

- The scanner is read-only: never write to the project under analysis.
- The core is deterministic: no LLM, no clock or randomness in formulas (time is passed in).
- Secrets are never stored or printed: keep only a hash and a mask.
- A new MCP tool must be added to the tests that list tools by name (`tests/server`).
- Keep the README (both languages) and `docs/formulas.md` in sync with the code.
- Tested platform so far: Windows, Node 22. Reports from other platforms are very welcome.
