import { afterAll, describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/analyzer/analyze.js';
import { RULES } from '../../src/analyzer/rules/index.js';
import { generateCandidates, type QuestInput, questId, shortId } from '../../src/game/quests/generate.js';
import { templateFor } from '../../src/game/quests/templates.js';
import { computeStats } from '../../src/game/stats.js';
import type { Facts, Finding, Severity, Stats } from '../../src/types.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

const NOW = '2026-09-30T12:00:00.000Z';

function facts(overrides: Partial<Facts> = {}): Facts {
  return {
    languages: {},
    stacks: [],
    frameworks: [],
    domains: [{ pack: 'generic', confidence: 1, evidence: [] }],
    commands: {},
    sourceFiles: 10,
    modules: 10,
    modulesWithTests: 5,
    testCasesTotal: 7,
    testCasesByModule: { 'src/a.ts': 7 },
    codeLines: 400,
    fileLines: { 'src/a.ts': 120 },
    botHandlers: 0,
    hotspots: [],
    ...overrides,
  };
}

let counter = 0;
function finding(rule: string, category: string, severity: Severity, file: string | undefined, key = ''): Finding {
  counter++;
  return {
    id: `f${String(counter).padStart(3, '0')}`,
    rule,
    category,
    severity,
    ...(file ? { file } : {}),
    message: '',
    key,
  };
}

const FULL_STATS: Stats = {
  architecture: 100,
  testing: 100,
  security: 100,
  performance: 100,
  cleanCode: 100,
  reliability: 100,
  maintainability: 100,
  bugs: 0,
  techDebt: 0,
};

function input(findings: Finding[], overrides: Partial<QuestInput> & { facts?: Partial<Facts> } = {}): QuestInput {
  const { facts: factOverrides, ...rest } = overrides;
  return {
    snapshot: { facts: facts(factOverrides), findings, head: 'abc' },
    stats: FULL_STATS,
    commandsAllowed: false,
    scripts: {},
    now: NOW,
    ...rest,
  };
}

describe('templates', () => {
  it('every rule has a template, so no finding is left without a quest', () => {
    const rules = [...RULES.map((rule) => rule.id), 'generic/failing-tests'];
    const packs = new Set(['generic', 'shop', 'bot']);
    for (const rule of rules) {
      const sample = finding(rule, 'x', 'low', 'src/a.ts', 'k');
      expect(templateFor(sample, packs), `no template for ${rule}`).toBeDefined();
    }
  });

  it('chooses the pack template only when the pack is on', () => {
    const cart = finding('generic/untested-module', 'testing', 'medium', 'lib/cart.ts');
    expect(templateFor(cart, new Set(['generic', 'shop']))?.id).toBe('protect-cart');
    expect(templateFor(cart, new Set(['generic']))?.id).toBe('add-tests-for-module');
    const pay = finding('generic/untested-module', 'testing', 'high', 'lib/payment.ts');
    expect(templateFor(pay, new Set(['generic', 'shop']))?.id).toBe('payment-guardian');
    const parse = finding('generic/untested-module', 'testing', 'medium', 'src/parse.ts');
    expect(templateFor(parse, new Set(['generic', 'bot']))?.id).toBe('test-message-parsing');
    const token = finding('generic/hardcoded-secret', 'security', 'critical', 'src/bot.ts', 'telegram:abc');
    expect(templateFor(token, new Set(['generic', 'bot']))?.id).toBe('protect-the-token');
    expect(templateFor(token, new Set(['generic']))?.id).toBe('remove-hardcoded-secret');
  });
});

describe('grouping', () => {
  it('batches low and medium findings of one rule in one folder, ten per quest', () => {
    const todos = Array.from({ length: 12 }, (_, index) =>
      finding('generic/todo', 'clean-code', 'low', `src/f${index}.ts`, `t${index}`),
    );
    const other = finding('generic/todo', 'clean-code', 'low', 'lib/x.ts', 'x');
    const candidates = generateCandidates(input([...todos, other]));
    const sizes = candidates.map((candidate) => candidate.quest.findings.length).sort((a, b) => b - a);
    expect(sizes).toEqual([10, 2, 1]);
    expect(new Set(candidates.flatMap((candidate) => candidate.quest.findings)).size).toBe(13);
  });

  it('never batches secrets, webhooks, cycles or untested modules, nor high findings', () => {
    const findings = [
      finding('generic/untested-module', 'testing', 'medium', 'src/a.ts'),
      finding('generic/untested-module', 'testing', 'medium', 'src/b.ts'),
      finding('generic/import-cycle', 'architecture', 'medium', 'src/c.ts', 'src/c.ts|src/d.ts'),
      finding('generic/import-cycle', 'architecture', 'medium', 'src/e.ts', 'src/e.ts|src/f.ts'),
      finding('generic/empty-catch', 'reliability', 'medium', 'src/g.ts', 'a'),
      finding('generic/empty-catch', 'reliability', 'high', 'src/h.ts', 'b'),
    ];
    expect(generateCandidates(input(findings))).toHaveLength(6);
  });

  it('is deterministic and independent of finding order', () => {
    const findings = [
      finding('generic/todo', 'clean-code', 'low', 'src/a.ts', 'a'),
      finding('generic/todo', 'clean-code', 'low', 'src/b.ts', 'b'),
      finding('js/eval', 'security', 'high', 'src/c.ts', 'c'),
    ];
    const forward = generateCandidates(input(findings)).map((candidate) => candidate.quest.id);
    const backward = generateCandidates(input([...findings].reverse())).map((candidate) => candidate.quest.id);
    expect(backward).toEqual(forward);
  });
});

describe('quest id', () => {
  it('is 12 hex chars of template + sorted finding ids, and the short id is its first 5', () => {
    const a = finding('generic/todo', 'clean-code', 'low', 'a.ts');
    const b = finding('generic/todo', 'clean-code', 'low', 'b.ts');
    const id = questId('clean-up-todos', [a, b]);
    expect(id).toMatch(/^[0-9a-f]{12}$/);
    expect(questId('clean-up-todos', [b, a])).toBe(id);
    expect(questId('other', [a, b])).not.toBe(id);
    expect(shortId(id)).toBe(id.slice(0, 5));
  });
});

describe('difficulty', () => {
  const diff = (findings: Finding[]) =>
    generateCandidates(input(findings)).map((candidate) => candidate.quest.difficulty);

  it('follows the worst severity', () => {
    expect(diff([finding('generic/todo', 'clean-code', 'low', 'a.ts')])).toEqual(['easy']);
    expect(diff([finding('generic/untested-module', 'testing', 'medium', 'a.ts')])).toEqual(['medium']);
    expect(diff([finding('js/eval', 'security', 'high', 'a.ts')])).toEqual(['hard']);
    expect(diff([finding('generic/hardcoded-secret', 'security', 'critical', 'a.ts', 'k')])).toEqual(['hard']);
  });

  it('lifts security and architecture to at least Medium', () => {
    expect(diff([finding('generic/env-tracked', 'security', 'low', undefined)])).toEqual(['medium']);
    expect(diff([finding('generic/large-file', 'architecture', 'low', 'a.ts')])).toEqual(['medium']);
  });

  it('makes a quest over 3+ files with medium or worse Hard, but not a low one', () => {
    const medium = ['a', 'b', 'c'].map((name) =>
      finding('generic/empty-catch', 'reliability', 'medium', `src/${name}.ts`, name),
    );
    expect(diff(medium)).toEqual(['hard']);
    const low = ['a', 'b', 'c'].map((name) => finding('generic/todo', 'clean-code', 'low', `src/${name}.ts`, name));
    expect(diff(low)).toEqual(['easy']);
  });
});

describe('priority', () => {
  it('is weight × weakness × profile × hotness', () => {
    const stats = { ...FULL_STATS, security: 73 };
    const one = generateCandidates(input([finding('js/eval', 'security', 'high', 'src/a.ts')], { stats }))[0];
    expect(one?.priority).toBeCloseTo(5 * (0.1 + 0.27), 10);
    const hot = generateCandidates(
      input([finding('js/eval', 'security', 'high', 'src/a.ts')], { stats, facts: { hotspots: ['src/a.ts'] } }),
    )[0];
    expect(hot?.priority).toBeCloseTo(5 * 0.37 * 1.2, 10);
  });

  it('caps a batch weight at 10, gives bugs a fixed weakness of 1.1 and packs a 1.5 bonus', () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      finding('generic/empty-catch', 'reliability', 'medium', `src/f${index}.ts`, `k${index}`),
    );
    expect(generateCandidates(input(many))[0]?.priority).toBeCloseTo(10 * 0.1, 10);
    const bug = generateCandidates(input([finding('py/mutable-default', 'bug', 'medium', 'a.py', 'f(x)')]))[0];
    expect(bug?.priority).toBeCloseTo(2 * 1.1, 10);
    const shop = facts({
      domains: [
        { pack: 'generic', confidence: 1, evidence: [] },
        { pack: 'shop', confidence: 1, evidence: [] },
      ],
    });
    const webhook = generateCandidates({
      ...input([finding('shop/webhook-no-signature', 'security', 'critical', 'app/api/webhooks/x/route.ts')]),
      snapshot: {
        facts: shop,
        findings: [finding('shop/webhook-no-signature', 'security', 'critical', 'app/api/webhooks/x/route.ts')],
        head: null,
      },
    })[0];
    expect(webhook?.priority).toBeCloseTo(10 * 0.1 * 1.5, 10);
  });

  it('sorts weaker stats first and breaks ties by quest id', () => {
    const stats = { ...FULL_STATS, cleanCode: 20 };
    const candidates = generateCandidates(
      input(
        [finding('generic/todo', 'clean-code', 'low', 'a.ts', 'a'), finding('js/eval', 'security', 'low', 'b.ts', 'b')],
        { stats },
      ),
    );
    expect(candidates.map((candidate) => candidate.quest.template)).toEqual(['clean-up-todos', 'remove-eval']);
  });
});

describe('criteria and baseline', () => {
  const types = (findings: Finding[], overrides: Partial<QuestInput> & { facts?: Partial<Facts> } = {}) =>
    generateCandidates(input(findings, overrides))[0]?.quest.criteria.map((criterion) => criterion.type);

  it('adds starred command conditions only when the command is defined and allowed', () => {
    const cart = finding('generic/untested-module', 'testing', 'medium', 'lib/cart.ts');
    const defined = { facts: { commands: { test: 'npm test' } } };
    expect(types([cart])).toEqual(['tests_cover', 'target_exists', 'no_regressions']);
    expect(types([cart], defined)).toEqual(['tests_cover', 'target_exists', 'no_regressions']);
    expect(types([cart], { ...defined, commandsAllowed: true })).toEqual([
      'tests_cover',
      'target_exists',
      'command_passes',
      'no_regressions',
    ]);
    expect(types([cart], { commandsAllowed: true })).toEqual(['tests_cover', 'target_exists', 'no_regressions']);
  });

  it('keeps the unstarred test command of Fix Failing Tests and the plain conditions of documentation quests', () => {
    expect(types([finding('generic/failing-tests', 'bug', 'high', undefined)])).toEqual([
      'command_passes',
      'no_regressions',
    ]);
    expect(types([finding('generic/no-readme', 'maintainability', 'low', undefined)])).toEqual(['finding_resolved']);
  });

  it('puts the secret key, files and cycle members into the parameters', () => {
    const secret = generateCandidates(
      input([finding('generic/hardcoded-secret', 'security', 'critical', 'src/a.ts', 'stripe:abc#2')]),
    )[0];
    expect(secret?.quest.criteria[1]).toEqual({ type: 'pattern_absent', params: { secretKeys: ['stripe:abc'] } });
    const cycle = generateCandidates(
      input([finding('generic/import-cycle', 'architecture', 'medium', 'src/a.ts', 'src/a.ts|src/b.ts')]),
    )[0];
    expect(cycle?.quest.criteria[1]).toEqual({ type: 'target_exists', params: { files: ['src/a.ts', 'src/b.ts'] } });
  });

  it('records the baseline of spec §8.2', () => {
    const findings = [
      finding('js/eval', 'security', 'high', 'src/a.ts', 'e'),
      finding('generic/todo', 'clean-code', 'low', 'src/b.ts', 't'),
    ];
    const candidate = generateCandidates(
      input(findings, { scripts: { test: 'vitest run', build: 'tsc' }, facts: { botHandlers: 4 } }),
    ).find((item) => item.quest.template === 'remove-eval');
    expect(candidate?.quest).toMatchObject({ status: 'open', createdAt: NOW, pack: 'generic', category: 'security' });
    expect(candidate?.quest.baseline).toEqual({
      head: 'abc',
      takenAt: NOW,
      findings: candidate?.quest.findings,
      highFindings: [findings[0]?.id],
      testCasesTotal: 7,
      testCasesByModule: { 'src/a.ts': 7 },
      codeLines: 400,
      // Only the lines of the quest's own files.
      fileLines: { 'src/a.ts': 120 },
      botHandlers: 4,
      scripts: { test: 'vitest run', build: 'tsc' },
    });
  });
});

describe('real fixture projects', () => {
  async function titles(name: string): Promise<string[]> {
    const root = await copyFixture(`projects/${name}`);
    const snapshot = await analyzeProject(root, { now: new Date(NOW) });
    const stats = computeStats({ snapshot, commandsAllowed: false });
    const candidates = generateCandidates({ snapshot, stats, commandsAllowed: false, scripts: {}, now: NOW });
    // Every finding is in exactly one quest.
    const ids = candidates.flatMap((candidate) => candidate.quest.findings);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(snapshot.findings.length);
    return candidates.map((candidate) => candidate.quest.title).sort();
  }

  it('gives the shop the quests of spec §7.7', async () => {
    expect(await titles('nextjs-shop')).toEqual([
      'Clean Inventory',
      'Clean Up TODOs',
      'Optimize Images',
      'Payment Guardian',
      'Protect Cart',
      'Validate Payment Webhooks',
    ]);
  });

  it('gives the Node bot its bot quests', async () => {
    expect(await titles('node-telegram-bot')).toEqual([
      'Add Retry Logic',
      'Guard Admin Commands',
      'Handle API Errors',
      'Improve Command Routing',
      'Remove Debug Logs',
      'Test Message Parsing',
    ]);
  });

  it('gives the Python bot the same bot quests plus Unblock the Event Loop', async () => {
    expect(await titles('python-aiogram-bot')).toEqual([
      'Add Retry Logic',
      'Guard Admin Commands',
      'Handle API Errors',
      'Improve Command Routing',
      'Test Message Parsing',
      'Unblock the Event Loop',
    ]);
  });
});
