import { afterAll, describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/analyzer/analyze.js';
import { importCycleRule } from '../../src/analyzer/rules/import-cycle.js';
import { noTestCommandRule } from '../../src/analyzer/rules/no-test-command.js';
import type { Rule } from '../../src/analyzer/rules/types.js';
import { untestedModuleRule } from '../../src/analyzer/rules/untested-module.js';
import { unusedFileRule } from '../../src/analyzer/rules/unused-file.js';
import type { Finding } from '../../src/types.js';
import { cleanupTempDirs, makeGitProject } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

async function findingsOf(rule: Rule, files: Record<string, string>): Promise<Finding[]> {
  const root = await makeGitProject(files);
  const snapshot = await analyzeProject(root, { now: new Date(0), rules: [rule] });
  expect(snapshot.errors).toEqual([]);
  return snapshot.findings;
}

describe('generic/import-cycle', () => {
  it('reports a three-file cycle once, at its first file, with a stable key', async () => {
    const findings = await findingsOf(importCycleRule, {
      'src/a.ts': "import { b } from './b.js';\n\nexport function a(): number {\n  return b() + 1;\n}\n",
      'src/b.ts': "import { c } from './c.js';\n\nexport function b(): number {\n  return c() + 1;\n}\n",
      'src/c.ts': "import { a } from './a.js';\n\nexport function c(): number {\n  return a() + 1;\n}\n",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: 'generic/import-cycle',
      file: 'src/a.ts',
      key: 'src/a.ts|src/b.ts|src/c.ts',
      message: 'Import cycle: src/a.ts → src/b.ts → src/c.ts → src/a.ts',
    });
  });

  it('ignores a loop that goes through a test file', async () => {
    const findings = await findingsOf(importCycleRule, {
      'src/x.ts': "import { fixture } from './x.test.js';\n\nexport const x = fixture;\n",
      'src/x.test.ts': "import { x } from './x.js';\n\nexport const fixture = 1;\nexport const again = x;\n",
    });
    expect(findings).toEqual([]);
  });
});

describe('generic/untested-module', () => {
  it('skips entry points and modules shorter than 5 lines', async () => {
    const findings = await findingsOf(untestedModuleRule, {
      'src/index.ts': [
        "import { price } from './price.js';",
        "import { tiny } from './tiny.js';",
        '',
        'export const shown = price(tiny);',
        '',
      ].join('\n'),
      'src/price.ts': [
        'export function price(cents: number): number {',
        '  const base = cents / 100;',
        '  const tax = base * 0.2;',
        '  const total = base + tax;',
        '  return Math.round(total * 100) / 100;',
        '}',
        '',
      ].join('\n'),
      'src/tiny.ts': 'export const tiny = 1;\n',
    });
    expect(findings.map((finding) => finding.file)).toEqual(['src/price.ts']);
  });
});

describe('generic/unused-file', () => {
  it('flags only modules nobody imports, not entry points, configs, .d.ts or test-only helpers', async () => {
    const findings = await findingsOf(unusedFileRule, {
      'src/index.ts': "import { used } from './used.js';\n\nexport const value = used;\n",
      'src/used.ts': 'export const used = 1;\n',
      'src/lonely.ts': 'export const lonely = 2;\n',
      'src/only-in-tests.ts': 'export const helper = 3;\n',
      'src/only-in-tests.test.ts': "import { helper } from './only-in-tests.js';\n\nexport const check = helper;\n",
      'src/env.d.ts': 'declare const VERSION: string;\n',
      'vitest.config.ts': 'export default {};\n',
    });
    expect(findings.map((finding) => finding.file)).toEqual(['src/lonely.ts']);
  });
});

describe('generic/no-test-command', () => {
  const testedCode = {
    'src/sum.ts': 'export const sum = (a: number, b: number): number => a + b;\n',
    'src/sum.test.ts': "import { sum } from './sum.js';\n\nexport const three = sum(1, 2);\n",
  };

  it('points at package.json when its test script is the npm stub', async () => {
    const findings = await findingsOf(noTestCommandRule, {
      ...testedCode,
      'package.json': JSON.stringify({ name: 'demo', scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
    });
    expect(findings.map((finding) => finding.file)).toEqual(['package.json']);
  });

  it('reports without a file when there is no package.json at all', async () => {
    const findings = await findingsOf(noTestCommandRule, testedCode);
    expect(findings.map((finding) => finding.file)).toEqual([undefined]);
  });
});
