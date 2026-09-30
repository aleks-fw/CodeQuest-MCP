import { describe, expect, it } from 'vitest';
import { computeStats, healthScore, type StatsInput } from '../../src/game/stats.js';
import type { Facts, Finding, Severity } from '../../src/types.js';

function facts(overrides: Partial<Facts> = {}): Facts {
  return {
    languages: {},
    stacks: [],
    frameworks: [],
    domains: [],
    commands: {},
    scripts: {},
    sourceFiles: 10,
    modules: 10,
    modulesWithTests: 0,
    testCasesTotal: 0,
    testCasesByModule: {},
    codeLines: 0,
    fileLines: {},
    botHandlers: 0,
    hotspots: [],
    ...overrides,
  };
}

function finding(rule: string, category: string, severity: Severity = 'low'): Finding {
  return { id: `${rule}-${category}-${severity}`, rule, category, severity, message: '', key: '' };
}

function input(overrides: { facts?: Partial<Facts>; findings?: Finding[] } & Partial<StatsInput> = {}): StatsInput {
  const { facts: factOverrides, findings, ...rest } = overrides;
  return {
    snapshot: { facts: facts(factOverrides), findings: findings ?? [] },
    commandsAllowed: false,
    ...rest,
  };
}

describe('health stats', () => {
  it('gives 100 without findings', () => {
    expect(computeStats(input())).toMatchObject({
      architecture: 100,
      security: 100,
      performance: 100,
      cleanCode: 100,
      reliability: 100,
      maintainability: 100,
    });
  });

  it('matches the spec examples: one high security finding is 73 at 10 files and 90 at 250 files', () => {
    const high = [finding('generic/hardcoded-secret', 'security', 'high')];
    expect(computeStats(input({ findings: high })).security).toBe(73);
    expect(computeStats(input({ facts: { sourceFiles: 250 }, findings: high })).security).toBe(90);
    expect(healthScore(5, 2)).toBe(73);
  });

  it('sums severity weights per category and keeps categories apart', () => {
    const stats = computeStats(
      input({
        findings: [
          finding('a', 'security', 'critical'),
          finding('b', 'security', 'medium'),
          finding('c', 'clean-code', 'low'),
        ],
      }),
    );
    // W = 12, S = 2 → 100 × e^(−0.75)
    expect(stats.security).toBe(Math.round(100 * Math.exp(-12 / 16)));
    expect(stats.cleanCode).toBe(Math.round(100 * Math.exp(-1 / 16)));
    expect(stats.architecture).toBe(100);
  });

  it('never goes below 0 and ignores testing and unknown categories', () => {
    const many = Array.from({ length: 500 }, () => finding('x', 'security', 'critical'));
    expect(computeStats(input({ findings: many })).security).toBe(0);
    const stats = computeStats(input({ findings: [finding('t', 'testing', 'high'), finding('u', 'weird', 'high')] }));
    expect(stats.architecture).toBe(100);
    // Default facts: 10 modules, none tested, no test command → Testing has its own formula and is 0.
    expect(stats.testing).toBe(0);
  });
});

describe('testing stat', () => {
  it('is 100 when there are no modules', () => {
    expect(computeStats(input({ facts: { modules: 0 } })).testing).toBe(100);
  });

  it('uses 60 × share + 20 × command + 20 × green run when commands are allowed', () => {
    const base = { facts: { modules: 10, modulesWithTests: 5, commands: { test: 'npm test' } } };
    const green = computeStats(
      input({ ...base, commandsAllowed: true, lastTestRun: { passed: true, failedTests: 0 } }),
    );
    const red = computeStats(input({ ...base, commandsAllowed: true, lastTestRun: { passed: false, failedTests: 2 } }));
    const noRun = computeStats(input({ ...base, commandsAllowed: true }));
    expect(green.testing).toBe(70);
    expect(red.testing).toBe(50);
    expect(noRun.testing).toBe(50);
  });

  it('rescales to 0..100 without the run part when commands are not allowed', () => {
    const stats = computeStats(
      input({
        facts: { modules: 10, modulesWithTests: 5, commands: { test: 'npm test' } },
        lastTestRun: { passed: true, failedTests: 0 },
      }),
    );
    expect(stats.testing).toBe(Math.round((50 / 80) * 100));
  });

  it('prefers coverage from a report and clamps it', () => {
    expect(computeStats(input({ facts: { modules: 4, modulesWithTests: 0, coverage: 0.5 } })).testing).toBe(
      Math.round((30 / 80) * 100),
    );
    expect(computeStats(input({ facts: { modules: 4, modulesWithTests: 4, coverage: 1.4 } })).testing).toBe(
      Math.round((60 / 80) * 100),
    );
  });
});

describe('bugs and tech debt', () => {
  it('counts bug findings without the failing-tests one, plus failed tests when commands are allowed', () => {
    const findings = [
      finding('py/mutable-default', 'bug'),
      finding('generic/failing-tests', 'bug', 'high'),
      finding('x', 'security'),
    ];
    const run = { passed: false, failedTests: 3 };
    expect(computeStats(input({ findings, commandsAllowed: true, lastTestRun: run })).bugs).toBe(4);
    expect(computeStats(input({ findings, commandsAllowed: false, lastTestRun: run })).bugs).toBe(1);
  });

  it('counts only the tech-debt rules', () => {
    const findings = [
      finding('generic/todo', 'clean-code'),
      finding('generic/todo', 'clean-code', 'medium'),
      finding('generic/duplicate-block', 'clean-code'),
      finding('generic/unused-file', 'clean-code'),
      finding('generic/large-file', 'architecture'),
      finding('generic/suppression', 'clean-code'),
      finding('js/debug-log', 'clean-code'),
    ];
    expect(computeStats(input({ findings })).techDebt).toBe(6);
  });
});
