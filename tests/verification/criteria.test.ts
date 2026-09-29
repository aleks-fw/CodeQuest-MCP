import { describe, expect, it } from 'vitest';
import { buildContext } from '../../src/analyzer/analyze.js';
import type { Baseline, CommandRun, Criterion, Finding, Quest } from '../../src/types.js';
import { evaluateCriterion } from '../../src/verification/criteria.js';
import type { Evidence } from '../../src/verification/evidence.js';
import { sourceFiles } from '../helpers/source-files.js';

const CART = 'export function add(a: number, b: number) { return a + b; }\n';
const TEST3 = `import { add } from './cart';
it('a', () => { expect(add(1, 1)).toBe(2); });
it('b', () => { expect(add(2, 2)).toBe(4); });
it('c', () => { expect(add(3, 3)).toBe(6); });
`;

function baseline(overrides: Partial<Baseline> = {}): Baseline {
  return {
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
  };
}

function quest(criteria: Criterion[], overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'q1',
    template: 't',
    pack: 'generic',
    title: 'T',
    description: '',
    category: 'testing',
    difficulty: 'easy',
    findings: ['f1'],
    criteria,
    status: 'open',
    createdAt: '2026-09-30T00:00:00.000Z',
    baseline: baseline(),
    ...overrides,
  };
}

function finding(id: string, overrides: Partial<Finding> = {}): Finding {
  return { id, rule: 'generic/todo', category: 'cleanup', severity: 'low', message: '', key: '', ...overrides };
}

function evidence(
  files: Record<string, string>,
  extra: {
    findings?: Finding[];
    changed?: string[] | null;
    runs?: Evidence['runs'];
    changeKey?: string;
  } = {},
): Evidence {
  const ctx = buildContext({ root: '', files: sourceFiles(files), isGitRepo: false, tracked: new Set() });
  ctx.facts.commands = { test: 'npm test' };
  return {
    ctx,
    snapshot: { findings: extra.findings ?? [], facts: ctx.facts, changeKey: extra.changeKey ?? 'k1' },
    changed: extra.changed === undefined ? null : extra.changed === null ? null : new Set(extra.changed),
    runs: extra.runs ?? {},
  };
}

const run = (overrides: Partial<CommandRun> = {}): CommandRun => ({
  ok: true,
  exitCode: 0,
  durationMs: 1500,
  changeKey: 'k1',
  at: '2026-09-30T00:00:00.000Z',
  tail: '',
  ...overrides,
});

const check = (criterion: Criterion, q: Quest, e: Evidence) => evaluateCriterion(q, criterion, e);

describe('finding_resolved', () => {
  const criterion: Criterion = { type: 'finding_resolved', params: {} };

  it('passes when no finding of the quest is left and fails while one remains', () => {
    const q = quest([criterion]);
    expect(check(criterion, q, evidence({})).ok).toBe(true);
    const left = check(criterion, q, evidence({}, { findings: [finding('f1')] }));
    expect(left.ok).toBe(false);
    expect(left.detail).toContain('1 of 1');
  });

  it('minCases also asks for enough test cases in the project', () => {
    const withCases: Criterion = { type: 'finding_resolved', params: { minCases: 3 } };
    const q = quest([withCases]);
    expect(check(withCases, q, evidence({ 'a.test.ts': "it('x', () => {});\n" })).ok).toBe(false);
    expect(check(withCases, q, evidence({ 'a.test.ts': TEST3, 'cart.ts': CART })).ok).toBe(true);
  });
});

describe('tests_cover', () => {
  const criterion: Criterion = { type: 'tests_cover', params: { module: 'cart.ts' } };

  it('needs 3 test cases and 3 assertions in tests that import the module', () => {
    const q = quest([criterion]);
    expect(check(criterion, q, evidence({ 'cart.ts': CART, 'cart.test.ts': TEST3 })).ok).toBe(true);
    const few = check(
      criterion,
      q,
      evidence({ 'cart.ts': CART, 'cart.test.ts': TEST3.split('\n').slice(0, 3).join('\n') }),
    );
    expect(few.ok).toBe(false);
    expect(few.detail).toContain('2 test cases and 2 assertions');
  });

  it('does not count tests that do not import the module, skipped cases or a missing module', () => {
    const q = quest([criterion]);
    const unrelated = TEST3.replace("from './cart'", "from './other'");
    expect(check(criterion, q, evidence({ 'cart.ts': CART, 'other.ts': CART, 'x.test.ts': unrelated })).ok).toBe(false);
    const skipped = TEST3.replaceAll("it('", "it.skip('");
    expect(check(criterion, q, evidence({ 'cart.ts': CART, 'cart.test.ts': skipped })).ok).toBe(false);
    const gone = check(criterion, q, evidence({ 'cart.test.ts': TEST3 }));
    expect(gone.ok).toBe(false);
    expect(gone.missing).toBe(true);
  });
});

describe('target_exists', () => {
  const criterion = (params: Record<string, unknown>): Criterion => ({ type: 'target_exists', params });

  it('needs the files to exist and to be imported or entry points', () => {
    const c = criterion({ files: ['cart.ts'] });
    const q = quest([c]);
    expect(check(c, q, evidence({ 'cart.ts': CART, 'use.ts': "import './cart';\n" })).ok).toBe(true);
    const unused = check(c, q, evidence({ 'cart.ts': CART }));
    expect(unused.ok).toBe(false);
    expect(unused.missing).toBeUndefined();
    const gone = check(c, q, evidence({}));
    expect(gone.ok).toBe(false);
    expect(gone.missing).toBe(true);
  });

  it('bot handlers may not drop and admin handlers must still be in the code', () => {
    const e = evidence({ 'bot.py': '@router.message(Command("ban"))\nasync def ban(m): pass\n' });
    e.snapshot.facts.botHandlers = 2;
    const q = quest([]);
    expect(check(criterion({ minBotHandlers: 3 }), q, e).ok).toBe(false);
    expect(check(criterion({ minBotHandlers: 2 }), q, e).ok).toBe(true);
    expect(check(criterion({ commands: ['ban'] }), q, e).ok).toBe(true);
    expect(check(criterion({ commands: ['kick'] }), q, e).detail).toContain('kick');
  });

  it('movedLinesShare: the file must shrink and the lines must survive elsewhere', () => {
    const c = criterion({ files: ['big.ts'], movedLinesShare: 0.5 });
    const q = quest([c], { baseline: baseline({ fileLines: { 'big.ts': 100 }, codeLines: 100 }) });
    const use = { 'use.ts': "import './big';\n" };
    const shrunkAndMoved = evidence({ 'big.ts': 'export const a = 1;\n', ...use });
    shrunkAndMoved.snapshot.facts.fileLines = { 'big.ts': 40 };
    shrunkAndMoved.snapshot.facts.codeLines = 100;
    expect(check(c, q, shrunkAndMoved).ok).toBe(true);
    const deleted = evidence({ 'big.ts': 'export const a = 1;\n', ...use });
    deleted.snapshot.facts.fileLines = { 'big.ts': 40 };
    deleted.snapshot.facts.codeLines = 40;
    expect(check(c, q, deleted).detail).toContain('deleted, not moved');
    const same = evidence({ 'big.ts': 'export const a = 1;\n', ...use });
    same.snapshot.facts.fileLines = { 'big.ts': 90 };
    same.snapshot.facts.codeLines = 100;
    expect(check(c, q, same).ok).toBe(false);
  });
});

describe('pattern_present and pattern_absent', () => {
  it('pattern_present looks in the given files, or in all code when none are given', () => {
    const c: Criterion = { type: 'pattern_present', params: { files: ['w.ts'], pattern: 'constructEvent' } };
    const q = quest([c]);
    expect(check(c, q, evidence({ 'w.ts': 'stripe.webhooks.constructEvent(body)\n' })).ok).toBe(true);
    expect(check(c, q, evidence({ 'w.ts': 'nothing\n' })).ok).toBe(false);
    expect(check(c, q, evidence({})).missing).toBe(true);
    const anywhere: Criterion = { type: 'pattern_present', params: { pattern: 'bot\\.catch' } };
    expect(check(anywhere, q, evidence({ 'index.ts': 'bot.catch(err)\n' })).ok).toBe(true);
    expect(check({ type: 'pattern_present', params: { pattern: '(' } }, q, evidence({})).detail).toBe(
      'Invalid pattern',
    );
  });

  it('pattern_absent without a pattern means the file is deleted', () => {
    const c: Criterion = { type: 'pattern_absent', params: { files: ['old.ts'] } };
    const q = quest([c]);
    expect(check(c, q, evidence({ 'old.ts': 'x\n' })).ok).toBe(false);
    expect(check(c, q, evidence({})).ok).toBe(true);
  });

  it('pattern_absent with secret keys fails while any secret finding has the same key, wherever it moved', () => {
    const c: Criterion = { type: 'pattern_absent', params: { secretKeys: ['telegram:abc'] } };
    const q = quest([c]);
    const secret = finding('s9', { rule: 'generic/hardcoded-secret', file: 'moved.ts', key: 'telegram:abc#2' });
    expect(check(c, q, evidence({}, { findings: [secret] })).ok).toBe(false);
    expect(
      check(c, q, evidence({}, { findings: [finding('s1', { rule: 'generic/hardcoded-secret', key: 'other:1' })] })).ok,
    ).toBe(true);
  });
});

describe('command_passes', () => {
  const c: Criterion = { type: 'command_passes', params: { command: 'test' } };
  const q = quest([c]);

  it('needs a passing run for the current files', () => {
    expect(check(c, q, evidence({}, { runs: { test: run() } })).ok).toBe(true);
    expect(check(c, q, evidence({}, { runs: { test: run({ ok: false, exitCode: 1 }) } })).detail).toContain('failed');
    expect(check(c, q, evidence({}, { runs: { test: run({ changeKey: 'old' }) } })).detail).toContain('not been run');
    expect(check(c, q, evidence({})).ok).toBe(false);
  });

  it('fails when the project has no such command', () => {
    const e = evidence({}, { runs: { test: run() } });
    e.snapshot.facts.commands = {};
    expect(check(c, q, e).detail).toContain('No test command');
  });
});

describe('no_regressions', () => {
  const c: Criterion = { type: 'no_regressions', params: {} };

  it('fails on a new high finding in a changed file, not in an untouched one or a known one', () => {
    const q = quest([c], { baseline: baseline({ highFindings: ['old'] }) });
    const fresh = finding('new', { severity: 'high', file: 'a.ts', rule: 'js/eval' });
    expect(check(c, q, evidence({}, { findings: [fresh], changed: ['a.ts'] })).ok).toBe(false);
    expect(check(c, q, evidence({}, { findings: [fresh], changed: ['b.ts'] })).ok).toBe(true);
    const known = finding('old', { severity: 'high', file: 'a.ts' });
    expect(check(c, q, evidence({}, { findings: [known], changed: ['a.ts'] })).ok).toBe(true);
    expect(check(c, q, evidence({}, { findings: [fresh], changed: null })).ok).toBe(false);
  });

  it('fails when test cases were deleted, in total or in a module that still exists', () => {
    const q = quest([c], { baseline: baseline({ testCasesTotal: 5, testCasesByModule: { 'cart.ts': 5 } }) });
    const fewer = check(c, q, evidence({ 'cart.ts': CART, 'cart.test.ts': TEST3 }));
    expect(fewer.ok).toBe(false);
    expect(fewer.detail).toContain('dropped from 5 to 3');
    const deletedModule = check(c, q, evidence({ 'x.test.ts': `${TEST3}${TEST3}` }));
    expect(deletedModule.detail).not.toContain('cart.ts');
  });

  it('fails when the test run for the current files is red, and ignores a stale red run', () => {
    const q = quest([c]);
    expect(check(c, q, evidence({}, { runs: { test: run({ ok: false, exitCode: 1 }) } })).ok).toBe(false);
    expect(check(c, q, evidence({}, { runs: { test: run({ ok: false, exitCode: 1, changeKey: 'old' }) } })).ok).toBe(
      true,
    );
  });
});
