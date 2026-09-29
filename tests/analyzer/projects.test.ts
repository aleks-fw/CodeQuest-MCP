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
