import { describe, expect, it } from 'vitest';
import { buildContext } from '../../src/analyzer/analyze.js';
import type { Baseline, Criterion, Finding, Quest } from '../../src/types.js';
import type { Evidence } from '../../src/verification/evidence.js';
import { autoDue, neededCommands, verifyQuest } from '../../src/verification/verify.js';
import { sourceFiles } from '../helpers/source-files.js';

const baseline = (overrides: Partial<Baseline> = {}): Baseline => ({
  head: null,
  takenAt: '2026-09-30T00:00:00.000Z',
  findings: [],
  highFindings: [],
  testCasesTotal: 0,
  testCasesByModule: {},
  codeLines: 0,
  fileLines: {},
  botHandlers: 0,
  scripts: {},
  ...overrides,
});

const quest = (id: string, criteria: Criterion[], overrides: Partial<Quest> = {}): Quest => ({
  id,
  template: 't',
  pack: 'generic',
  title: id,
  description: '',
  category: 'cleanup',
  difficulty: 'easy',
  findings: [`${id}-f`],
  criteria,
  status: 'open',
  createdAt: '2026-09-30T00:00:00.000Z',
  baseline: baseline(),
  ...overrides,
});

function evidence(files: Record<string, string>, findings: Finding[] = []): Evidence {
  const ctx = buildContext({ root: '', files: sourceFiles(files), isGitRepo: false, tracked: new Set() });
  return { ctx, snapshot: { findings, facts: ctx.facts, changeKey: 'k' }, changed: null, runs: {} };
}

const finding = (id: string): Finding => ({
  id,
  rule: 'generic/todo',
  category: 'cleanup',
  severity: 'low',
  message: '',
  key: '',
});

const RESOLVED: Criterion = { type: 'finding_resolved', params: {} };
const EXISTS = (file: string): Criterion => ({ type: 'target_exists', params: { files: [file] } });
const OPTIONS = { currentScripts: {} };

describe('verifyQuest', () => {
  it('completes a quest whose conditions all hold', () => {
    const verdict = verifyQuest(quest('a', [RESOLVED]), evidence({}), OPTIONS);
    expect(verdict.outcome).toBe('completed');
    expect(verdict.results.map((r) => r.ok)).toEqual([true]);
  });

  it('keeps the quest open while a finding remains, and reports which condition failed', () => {
    const verdict = verifyQuest(quest('a', [RESOLVED, EXISTS('x.ts')]), evidence({}, [finding('a-f')]), OPTIONS);
    expect(verdict.outcome).toBe('open');
    expect(verdict.results.map((r) => r.ok)).toEqual([false, false]);
  });

  it('marks the quest obsolete when the findings are gone because the file is gone', () => {
    const verdict = verifyQuest(quest('a', [RESOLVED, EXISTS('x.ts')]), evidence({}), OPTIONS);
    expect(verdict.outcome).toBe('obsolete');
  });

  it('stays open, not obsolete, when a file is missing but the findings are still reported', () => {
    const verdict = verifyQuest(quest('a', [RESOLVED, EXISTS('x.ts')]), evidence({}, [finding('a-f')]), OPTIONS);
    expect(verdict.outcome).toBe('open');
  });

  it('flags a changed script only for commands the quest relied on', () => {
    const q = quest('a', [{ type: 'no_regressions', params: {} }], {
      baseline: baseline({ scripts: { test: 'vitest' } }),
    });
    expect(verifyQuest(q, evidence({}), { currentScripts: { test: 'echo ok' } }).scriptChanged).toBe(true);
    expect(verifyQuest(q, evidence({}), { currentScripts: { test: 'vitest' } }).scriptChanged).toBe(false);
    const fresh = quest('b', [{ type: 'no_regressions', params: {} }]);
    expect(verifyQuest(fresh, evidence({}), { currentScripts: { test: 'vitest' } }).scriptChanged).toBe(false);
  });
});

describe('epics', () => {
  const sub = (id: string, status: Quest['status'] = 'open') => quest(id, [RESOLVED], { status });

  it('is completed when every open subtask is', () => {
    const epic = quest('e', [], { difficulty: 'epic', subtasks: [sub('a'), sub('b'), sub('c', 'completed')] });
    const verdict = verifyQuest(epic, evidence({}), OPTIONS);
    expect(verdict.outcome).toBe('completed');
    expect(verdict.subtasks?.map((v) => v.questId)).toEqual(['a', 'b']);
  });

  it('stays open while one subtask is open', () => {
    const epic = quest('e', [], { difficulty: 'epic', subtasks: [sub('a'), sub('b')] });
    expect(verifyQuest(epic, evidence({}, [finding('b-f')]), OPTIONS).outcome).toBe('open');
  });

  it('is obsolete when nothing was done and every subtask went obsolete', () => {
    const gone = (id: string) => quest(id, [RESOLVED, EXISTS('x.ts')]);
    const epic = quest('e', [], { difficulty: 'epic', subtasks: [gone('a'), gone('b')] });
    expect(verifyQuest(epic, evidence({}), OPTIONS).outcome).toBe('obsolete');
  });
});

describe('autoDue', () => {
  it('is due when all findings of an open quest vanished', () => {
    const q = quest('a', [RESOLVED]);
    expect(autoDue(q, { findings: [] })).toBe(true);
    expect(autoDue(q, { findings: [finding('a-f')] })).toBe(false);
    expect(autoDue({ ...q, status: 'completed' }, { findings: [] })).toBe(false);
  });

  it('an epic is due when one of its open subtasks is', () => {
    const epic = quest('e', [], { subtasks: [quest('a', [RESOLVED]), quest('b', [RESOLVED])] });
    expect(autoDue(epic, { findings: [finding('a-f')] })).toBe(true);
    expect(autoDue(epic, { findings: [finding('a-f'), finding('b-f')] })).toBe(false);
  });
});

describe('neededCommands', () => {
  it('lists command_passes commands and test for no_regressions, only those the project has', () => {
    const q = quest('a', [
      { type: 'command_passes', params: { command: 'lint' } },
      { type: 'command_passes', params: { command: 'build' } },
      { type: 'no_regressions', params: {} },
    ]);
    expect(neededCommands([q], { test: 'npm test', lint: 'npm run lint' })).toEqual(['lint', 'test']);
    expect(neededCommands([q], {})).toEqual([]);
  });

  it('reads the open subtasks of an epic', () => {
    const epic = quest('e', [], {
      subtasks: [
        quest('a', [{ type: 'command_passes', params: { command: 'build' } }]),
        quest('b', [{ type: 'command_passes', params: { command: 'lint' } }], { status: 'completed' }),
      ],
    });
    expect(neededCommands([epic], { build: 'b', lint: 'l' })).toEqual(['build']);
  });
});
