import { afterAll, describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/analyzer/analyze.js';
import { buildBoard, findQuest, MAX_OPEN, passesAdaptation } from '../../src/game/quests/board.js';
import { type Candidate, generateCandidates } from '../../src/game/quests/generate.js';
import { computeStats } from '../../src/game/stats.js';
import type { Facts, Finding, Quest, Severity, Stats } from '../../src/types.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

const NOW = '2026-09-30T12:00:00.000Z';

const STATS: Stats = {
  architecture: 50,
  testing: 50,
  security: 50,
  performance: 50,
  cleanCode: 50,
  reliability: 50,
  maintainability: 50,
  bugs: 0,
  techDebt: 0,
};

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
    testCasesTotal: 0,
    testCasesByModule: {},
    codeLines: 0,
    fileLines: {},
    botHandlers: 0,
    hotspots: [],
    ...overrides,
  };
}

let counter = 0;
function finding(rule: string, category: string, severity: Severity, file: string, key = ''): Finding {
  counter++;
  return { id: `g${String(counter).padStart(3, '0')}`, rule, category, severity, file, message: '', key };
}

function candidates(findings: Finding[], stats: Stats = STATS): Candidate[] {
  return generateCandidates({
    snapshot: { facts: facts(), findings, head: null },
    stats,
    commandsAllowed: false,
    scripts: {},
    now: NOW,
  });
}

const titles = (quests: readonly Quest[]) => quests.map((quest) => quest.title);

describe('adaptation', () => {
  const [security] = candidates([finding('js/eval', 'security', 'high', 'a.ts')]);
  const [lowSecurity] = candidates([finding('generic/env-tracked', 'security', 'low', 'x')]);
  const [bug] = candidates([finding('py/mutable-default', 'bug', 'medium', 'a.py', 'k')]);

  it('stops Easy and Medium quests of a category whose stat is 80 or more, not Hard, Epic or bugs', () => {
    expect(security?.quest.difficulty).toBe('hard');
    expect(lowSecurity?.quest.difficulty).toBe('medium');
    const strong = { ...STATS, security: 80, bugs: 0 };
    expect(passesAdaptation(lowSecurity as Candidate, strong)).toBe(false);
    expect(passesAdaptation(security as Candidate, strong)).toBe(true);
    expect(passesAdaptation(bug as Candidate, { ...strong, cleanCode: 100, reliability: 100 })).toBe(true);
    expect(passesAdaptation(lowSecurity as Candidate, { ...STATS, security: 79 })).toBe(true);
  });

  it('never removes quests that are already open', () => {
    const open = lowSecurity ? [lowSecurity.quest] : [];
    const board = buildBoard({ candidates: [], open, stats: { ...STATS, security: 100 }, now: NOW });
    expect(board.quests).toEqual(open);
    expect(board.opened).toEqual([]);
  });
});

describe('board limits', () => {
  it('opens at most 8 quests and at most 3 per category', () => {
    const findings = [
      ...['a', 'b', 'c', 'd', 'e'].map((dir) => finding('generic/todo', 'clean-code', 'low', `${dir}/x.ts`, dir)),
      finding('js/eval', 'security', 'high', 'lib/a.ts', 'e1'),
      finding('js/dangerous-html', 'security', 'high', 'lib/b.ts', 'e2'),
      finding('generic/hardcoded-secret', 'security', 'critical', 'lib/c.ts', 'stripe:1'),
      finding('generic/hardcoded-secret', 'security', 'critical', 'lib/d.ts', 'stripe:2'),
      finding('generic/env-tracked', 'security', 'high', 'x'),
      finding('generic/no-readme', 'maintainability', 'low', 'x'),
      finding('generic/no-lockfile', 'maintainability', 'low', 'y'),
      finding('generic/no-env-example', 'maintainability', 'low', 'z'),
      finding('generic/no-tests', 'testing', 'high', 'q'),
    ];
    const board = buildBoard({ candidates: candidates(findings), open: [], stats: STATS, now: NOW });
    expect(board.quests.length).toBeLessThanOrEqual(MAX_OPEN);
    const perCategory = new Map<string, number>();
    for (const quest of board.quests) perCategory.set(quest.category, (perCategory.get(quest.category) ?? 0) + 1);
    expect(Math.max(...perCategory.values())).toBeLessThanOrEqual(3);
    expect(perCategory.get('security')).toBe(3);
    expect(board.quests).toHaveLength(MAX_OPEN);
  });

  it('keeps open quests and fills only the free places, skipping candidates that share their findings', () => {
    const all = candidates([
      finding('generic/todo', 'clean-code', 'low', 'a/x.ts', 'a'),
      finding('js/eval', 'security', 'high', 'lib/a.ts', 'e1'),
      finding('generic/no-readme', 'maintainability', 'low', 'x'),
    ]);
    const first = all[0]?.quest;
    if (!first) throw new Error('no candidate');
    const board = buildBoard({ candidates: all, open: [first], stats: STATS, now: NOW });
    expect(board.opened.map((quest) => quest.id)).not.toContain(first.id);
    expect(board.quests.map((quest) => quest.id).sort()).toEqual(all.map((item) => item.quest.id).sort());
    expect(board.opened).toHaveLength(2);
  });

  it('orders the board by difficulty, then by priority', () => {
    const board = buildBoard({
      candidates: candidates([
        finding('js/eval', 'security', 'high', 'lib/a.ts', 'e1'),
        finding('generic/todo', 'clean-code', 'low', 'a/x.ts', 'a'),
        finding('generic/untested-module', 'testing', 'medium', 'lib/b.ts'),
        finding('js/raw-img', 'performance', 'low', 'app/p.tsx', 'r'),
      ]),
      open: [],
      stats: { ...STATS, performance: 10, cleanCode: 60 },
      now: NOW,
    });
    expect(board.quests.map((quest) => quest.difficulty)).toEqual(['easy', 'easy', 'medium', 'hard']);
    // The weak performance stat puts the image quest above the TODO quest inside Easy.
    expect(titles(board.quests).slice(0, 2)).toEqual(['Optimize Images', 'Clean Up TODOs']);
  });
});

describe('epics', () => {
  it('builds a generic epic from three Medium-or-harder quests of one top folder', () => {
    const findings = [
      finding('js/eval', 'security', 'high', 'src/a/x.ts', 'e'),
      finding('generic/large-file', 'architecture', 'medium', 'src/b/y.ts', 'l'),
      finding('js/sync-fs-in-handler', 'performance', 'medium', 'src/c/z.ts', 's'),
      finding('generic/todo', 'clean-code', 'low', 'src/d/t.ts', 't'),
    ];
    const board = buildBoard({ candidates: candidates(findings), open: [], stats: STATS, now: NOW });
    const epic = board.quests.find((quest) => quest.difficulty === 'epic');
    expect(epic?.title).toBe('Fortify src/');
    expect(epic?.subtasks).toHaveLength(3);
    // The subtasks are not separate rows; the easy TODO quest stays an ordinary quest.
    expect(titles(board.quests).sort()).toEqual(['Clean Up TODOs', 'Fortify src/']);
    expect(epic?.findings).toHaveLength(3);
    expect(epic?.criteria).toEqual([]);
  });

  it('needs three quests in an area and does not count Easy ones in a generic area', () => {
    const two = [
      finding('js/eval', 'security', 'high', 'src/a/x.ts', 'e'),
      finding('generic/large-file', 'architecture', 'medium', 'src/b/y.ts', 'l'),
      finding('generic/todo', 'clean-code', 'low', 'src/d/t.ts', 't'),
    ];
    const board = buildBoard({ candidates: candidates(two), open: [], stats: STATS, now: NOW });
    expect(board.quests.some((quest) => quest.difficulty === 'epic')).toBe(false);
    expect(board.quests).toHaveLength(3);
  });

  it('builds no second epic while one is open', () => {
    const findings = [
      finding('js/eval', 'security', 'high', 'src/a/x.ts', 'e'),
      finding('generic/large-file', 'architecture', 'medium', 'src/b/y.ts', 'l'),
      finding('js/sync-fs-in-handler', 'performance', 'medium', 'src/c/z.ts', 's'),
    ];
    const first = buildBoard({ candidates: candidates(findings), open: [], stats: STATS, now: NOW });
    const epic = first.quests.find((quest) => quest.difficulty === 'epic');
    if (!epic) throw new Error('no epic');
    const more = [
      finding('js/eval', 'security', 'high', 'lib/a/x.ts', 'e'),
      finding('generic/large-file', 'architecture', 'medium', 'lib/b/y.ts', 'l'),
      finding('js/sync-fs-in-handler', 'performance', 'medium', 'lib/c/z.ts', 's'),
    ];
    const board = buildBoard({ candidates: candidates(more), open: [epic], stats: STATS, now: NOW });
    expect(board.quests.filter((quest) => quest.difficulty === 'epic')).toHaveLength(1);
    expect(board.opened).toHaveLength(3);
  });
});

describe('boards of the fixture projects', () => {
  async function boardOf(name: string) {
    const root = await copyFixture(`projects/${name}`);
    const snapshot = await analyzeProject(root, { now: new Date(NOW) });
    const stats = computeStats({ snapshot, commandsAllowed: false });
    return buildBoard({
      candidates: generateCandidates({ snapshot, stats, commandsAllowed: false, scripts: {}, now: NOW }),
      open: [],
      stats,
      now: NOW,
    });
  }

  it('shop: the Checkout Master epic with its three quests; strong cleanup and performance stats hold back the easy ones', async () => {
    // Spec §7.7 shows three Easy quests on this board, but §7.6 stops new Easy quests of a category whose stat is 80+.
    // The fixture's Clean Code and Performance stats are about 88 and 94, so the rule wins here (see stage-7 plan).
    const board = await boardOf('nextjs-shop');
    expect(board.quests.map((quest) => quest.difficulty)).toEqual(['epic']);
    const epic = board.quests.at(-1);
    expect(epic?.title).toBe('Checkout Master');
    expect(titles(epic?.subtasks ?? []).sort()).toEqual([
      'Payment Guardian',
      'Protect Cart',
      'Validate Payment Webhooks',
    ]);
  });

  it('bot: the Command Center epic takes three bot quests and one stays ordinary; strong stats hold back the rest', async () => {
    const board = await boardOf('node-telegram-bot');
    const epic = board.quests.find((quest) => quest.difficulty === 'epic');
    expect(epic?.title).toBe('Command Center');
    expect(epic?.subtasks).toHaveLength(3);
    const subtaskTitles = new Set(titles(epic?.subtasks ?? []));
    const rows = titles(board.quests).filter((title) => title !== 'Command Center');
    expect(rows).toHaveLength(1);
    expect(subtaskTitles.has(rows[0] ?? '')).toBe(false);
    // Architecture and Clean Code are above 80, so the Medium routing quest and the Easy debug-log quest are not given.
    expect(new Set([...subtaskTitles, ...rows])).toEqual(
      new Set(['Add Retry Logic', 'Guard Admin Commands', 'Handle API Errors', 'Test Message Parsing']),
    );
  });
});

describe('findQuest', () => {
  const quests = ['aaaaa1111111', 'aaaaa2222222', 'bbbbb3333333'].map(
    (id, index) => ({ id, title: index === 2 ? 'Clean Up TODOs' : 'Twin', findings: [] }) as unknown as Quest,
  );

  it('finds by full id, unique prefix and title, case-insensitively', () => {
    expect(findQuest(quests, 'aaaaa1111111')).toEqual({ quest: quests[0] });
    expect(findQuest(quests, 'BBB')).toEqual({ quest: quests[2] });
    expect(findQuest(quests, 'clean up todos')).toEqual({ quest: quests[2] });
  });

  it('reports ambiguity and misses instead of guessing', () => {
    expect(findQuest(quests, 'aaaaa')).toEqual({ error: '"aaaaa" matches 2 quests; type a longer number' });
    expect(findQuest(quests, 'twin')).toEqual({ error: '"twin" is the title of 2 quests; use the number' });
    expect(findQuest(quests, 'zzz')).toEqual({ error: 'No quest "zzz"' });
    expect(findQuest(quests, '  ')).toEqual({ error: 'No quest given' });
  });
});
