import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { type SourceFile, toSourceFile } from '../../src/analyzer/files.js';
import { buildImportGraph } from '../../src/analyzer/import-graph.js';
import { collectTestFacts, countAssertions, countTestCases, readCoverage } from '../../src/analyzer/test-facts.js';
import { sourceFiles } from '../helpers/source-files.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

function file(filePath: string, content: string | null): SourceFile {
  return toSourceFile({ path: filePath, size: content?.length ?? 0, mtimeMs: 0 }, content);
}

describe('countTestCases / countAssertions', () => {
  it('counts JS cases without skipped ones and counts expect/assert calls', () => {
    const test = file(
      'src/cart.test.ts',
      [
        "describe('cart', () => {",
        "  it('adds', () => { expect(add(1)).toBe(1); });",
        "  test('removes', async () => { expect(x).toEqual(y); assert.ok(z); });",
        "  it.only('focus', () => { assert(true); });",
        "  it.skip('later', () => {});",
        "  xit('old', () => {});",
        "  obj.it('not a test');",
        '});',
      ].join('\n'),
    );
    expect(countTestCases(test)).toBe(3);
    expect(countAssertions(test)).toBe(4);
  });

  it('counts Python cases without skip-decorated ones and counts assert statements', () => {
    const test = file(
      'tests/test_bot.py',
      [
        'import pytest',
        '',
        'def test_start():',
        '    assert reply("/start") == "hi"',
        '',
        'async def test_help(bot):',
        '    assert await bot.help()',
        '',
        '@pytest.mark.skip(reason="flaky")',
        '',
        'def test_flaky():',
        '    assert False',
        '',
        'class TestAdmin(unittest.TestCase):',
        '    @unittest.skip("todo")',
        '    def test_ban(self):',
        '        self.assertEqual(ban(1), True)',
        '',
        '    def test_kick(self):',
        '        self.assertTrue(kick(1))',
        '',
        'def helper_test():',
        '    pass',
      ].join('\n'),
    );
    expect(countTestCases(test)).toBe(3);
    expect(countAssertions(test)).toBe(5);
  });

  it('returns 0 for other languages and unread files', () => {
    expect(countTestCases(file('README.md', "it('x', () => {})"))).toBe(0);
    expect(countTestCases(file('src/big.test.ts', null))).toBe(0);
    expect(countAssertions(file('src/big.test.ts', null))).toBe(0);
  });
});

describe('collectTestFacts', () => {
  it('credits directly imported code modules with the cases of each test file', () => {
    const files = sourceFiles({
      'src/cart.ts': 'export const add = (a: number) => a;\n',
      'src/pay.ts': 'export const pay = () => 1;\n',
      'vitest.config.ts': 'export default {};\n',
      'src/cart.test.ts': [
        "import { add } from './cart';",
        "import cfg from '../vitest.config';",
        "it('a', () => expect(add(1)).toBe(1));",
        "it('b', () => expect(add(2)).toBe(2));",
        '',
      ].join('\n'),
      'src/all.test.ts': [
        "import { add } from './cart';",
        "import { pay } from './pay';",
        "import { helper } from './helper.test';",
        "test('c', () => { expect(pay()).toBe(1); });",
        '',
      ].join('\n'),
      'src/helper.test.ts': 'export const helper = 1;\n',
    });
    const facts = collectTestFacts(files, buildImportGraph(files, null));
    expect(facts.testFiles).toEqual(['src/all.test.ts', 'src/cart.test.ts', 'src/helper.test.ts']);
    expect(facts.casesByFile).toEqual({ 'src/all.test.ts': 1, 'src/cart.test.ts': 2, 'src/helper.test.ts': 0 });
    expect(facts.assertionsByFile).toEqual({ 'src/all.test.ts': 1, 'src/cart.test.ts': 2, 'src/helper.test.ts': 0 });
    expect(facts.testCasesTotal).toBe(3);
    expect(facts.testCasesByModule).toEqual({ 'src/cart.ts': 3, 'src/pay.ts': 1 });
    expect([...facts.testedModules]).toEqual(['src/cart.ts', 'src/pay.ts']);
    expect(facts.coverage).toBeUndefined();
  });
});

describe('readCoverage', () => {
  it('reads total line percent from coverage-summary.json', async () => {
    const root = await makeTempDir();
    await mkdir(path.join(root, 'coverage'));
    await writeFile(
      path.join(root, 'coverage', 'coverage-summary.json'),
      JSON.stringify({ total: { lines: { total: 8, covered: 7, pct: 87.5 } } }),
    );
    expect(await readCoverage(root)).toBe(0.875);
  });

  it('reads line-rate from coverage.xml', async () => {
    const root = await makeTempDir();
    await writeFile(
      path.join(root, 'coverage.xml'),
      '<?xml version="1.0" ?>\n<coverage version="7.4" line-rate="0.62" branch-rate="0">\n</coverage>\n',
    );
    expect(await readCoverage(root)).toBe(0.62);
  });

  it('returns undefined without a readable report', async () => {
    const empty = await makeTempDir();
    expect(await readCoverage(empty)).toBeUndefined();
    const broken = await makeTempDir();
    await mkdir(path.join(broken, 'coverage'));
    await writeFile(path.join(broken, 'coverage', 'coverage-summary.json'), '{broken');
    expect(await readCoverage(broken)).toBeUndefined();
  });
});
