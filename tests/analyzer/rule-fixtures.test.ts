import { readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/analyzer/analyze.js';
import { RULES } from '../../src/analyzer/rules/index.js';
import { copyFixture, FIXTURES_DIR } from '../helpers/fixtures.js';
import { cleanupTempDirs } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

const NOW = new Date('2026-09-29T12:00:00.000Z');

// Folder `<scope>.<name>` holds the fixtures of rule `<scope>/<name>`.
const folders = readdirSync(path.join(FIXTURES_DIR, 'rules'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

function ruleIdOf(folder: string): string {
  const dot = folder.indexOf('.');
  return `${folder.slice(0, dot)}/${folder.slice(dot + 1)}`;
}

describe('rule fixtures', () => {
  it('every rule has a fixture folder and every folder belongs to a rule', () => {
    expect(folders.map(ruleIdOf).sort()).toEqual(RULES.map((rule) => rule.id).sort());
  });

  for (const folder of folders) {
    const id = ruleIdOf(folder);
    const rule = RULES.find((candidate) => candidate.id === id);

    it(`${id} finds the problem in bad`, async () => {
      expect(rule, `no rule with id ${id}`).toBeDefined();
      if (!rule) return;
      const snapshot = await analyzeProject(await copyFixture(`rules/${folder}/bad`), { now: NOW, rules: [rule] });
      expect(snapshot.errors).toEqual([]);
      expect(snapshot.findings.filter((finding) => finding.rule === id).length).toBeGreaterThan(0);
    });

    it(`${id} stays silent on good`, async () => {
      expect(rule, `no rule with id ${id}`).toBeDefined();
      if (!rule) return;
      const snapshot = await analyzeProject(await copyFixture(`rules/${folder}/good`), { now: NOW, rules: [rule] });
      expect(snapshot.errors).toEqual([]);
      expect(snapshot.findings).toEqual([]);
    });
  }
});
