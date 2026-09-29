import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/analyzer/analyze.js';
import { todoRule } from '../../src/analyzer/rules/todo.js';
import type { Rule } from '../../src/analyzer/rules/types.js';
import { cleanupTempDirs, initGitRepo, makeGitProject, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

const NOW = new Date('2026-09-29T12:00:00.000Z');

describe('analyzeProject', () => {
  it('works in an empty repository without commits', async () => {
    const dir = await makeTempDir();
    await initGitRepo(dir);
    const snapshot = await analyzeProject(dir, { now: NOW });
    expect(snapshot.schema).toBe(1);
    expect(snapshot.takenAt).toBe('2026-09-29T12:00:00.000Z');
    expect(snapshot.head).toBeNull();
    expect(snapshot.errors).toEqual([]);
    expect(snapshot.facts.sourceFiles).toBe(0);
    expect(snapshot.changeKey).toMatch(/^[0-9a-f]{16}$/);
    const todoOnly = await analyzeProject(dir, { now: NOW, rules: [todoRule] });
    expect(todoOnly.findings).toEqual([]);
  });

  it('records a throwing rule in errors and still runs the others', async () => {
    const root = await makeGitProject({ 'src/a.ts': '// TODO: later\n' });
    const boom: Rule = {
      id: 'test/boom',
      category: 'bug',
      severity: 'low',
      run() {
        throw new Error('boom');
      },
    };
    const snapshot = await analyzeProject(root, { now: NOW, rules: [boom, todoRule] });
    expect(snapshot.errors).toEqual([{ rule: 'test/boom', message: 'boom' }]);
    expect(snapshot.findings.map((finding) => finding.rule)).toEqual(['generic/todo']);
    expect(snapshot.head).toMatch(/^[0-9a-f]{40}$/);
  });

  it('sorts findings by file and line and numbers repeated keys', async () => {
    const root = await makeGitProject({
      'src/b.ts': 'export const b = 1;\n\n// TODO: later\n',
      'src/a.ts': '// TODO: same\nexport const a = 1;\n\n\n// TODO: same\n',
    });
    const snapshot = await analyzeProject(root, { now: NOW, rules: [todoRule] });
    expect(snapshot.findings.map((finding) => [finding.file, finding.line, finding.key])).toEqual([
      ['src/a.ts', 1, 'TODO:same'],
      ['src/a.ts', 5, 'TODO:same#2'],
      ['src/b.ts', 3, 'TODO:later'],
    ]);
  });

  it('gives the same snapshot twice, except takenAt', async () => {
    const root = await makeGitProject({
      'package.json': '{ "name": "demo", "scripts": { "test": "vitest run" } }\n',
      'src/index.ts': "import { sum } from './sum.js';\n// FIXME: wire up\nconsole.log(sum(1, 2));\n",
      'src/sum.ts': 'export const sum = (a: number, b: number): number => a + b;\n',
      'src/sum.test.ts': "import { sum } from './sum.js';\nit('adds', () => expect(sum(1, 2)).toBe(3));\n",
    });
    const first = await analyzeProject(root, { now: NOW });
    const second = await analyzeProject(root, { now: new Date(NOW.getTime() + 60_000) });
    expect(second.takenAt).not.toBe(first.takenAt);
    expect({ ...second, takenAt: first.takenAt }).toEqual(first);
  });

  it('analyzes a folder outside git', async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, 'app.js'), '// FIXME: broken\n');
    const snapshot = await analyzeProject(dir, { now: NOW, rules: [todoRule] });
    expect(snapshot.head).toBeNull();
    expect(snapshot.facts.hotspots).toEqual([]);
    expect(snapshot.findings).toMatchObject([
      { rule: 'generic/todo', file: 'app.js', line: 1, message: 'FIXME: broken' },
    ]);
  });
});
