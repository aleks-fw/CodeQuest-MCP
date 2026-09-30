import { describe, expect, it } from 'vitest';
import { buildFacts } from '../../src/analyzer/facts.js';
import type { JsProject } from '../../src/analyzer/js-project.js';
import type { PythonProject } from '../../src/analyzer/python-project.js';
import type { TestFacts } from '../../src/analyzer/test-facts.js';
import { sourceFiles } from '../helpers/source-files.js';

function jsProject(overrides: Partial<JsProject> = {}): JsProject {
  return {
    hasPackageJson: false,
    dependencies: [],
    scripts: {},
    packageManager: 'npm',
    frameworks: [],
    testRunner: null,
    commands: {},
    entryRefs: [],
    aliasBase: null,
    ...overrides,
  };
}

function pythonProject(overrides: Partial<PythonProject> = {}): PythonProject {
  return {
    dependencies: [],
    frameworks: [],
    hasPytest: false,
    hasRuff: false,
    interpreter: 'python',
    commands: {},
    ...overrides,
  };
}

function testFacts(overrides: Partial<TestFacts> = {}): TestFacts {
  return {
    testFiles: [],
    casesByFile: {},
    assertionsByFile: {},
    testCasesTotal: 0,
    testCasesByModule: {},
    testedModules: new Set(),
    ...overrides,
  };
}

describe('buildFacts', () => {
  it('counts languages, stacks, source files and modules', () => {
    const files = sourceFiles({
      'src/a.ts': 'export const a = 1;\n',
      'src/a.test.ts': "it('a', () => {});\n",
      'src/types.d.ts': 'declare const x: number;\n',
      'vite.config.ts': 'export default {};\n',
      'bot.py': 'print(1)\n',
      'index.html': '<p></p>\n',
      'README.md': '# x\n',
    });
    const facts = buildFacts({
      files,
      js: jsProject({ frameworks: ['react'], commands: { test: 'npm test' } }),
      python: pythonProject({
        frameworks: ['aiogram'],
        commands: { test: 'python -m pytest -q', lint: 'python -m ruff check .' },
      }),
      tests: testFacts({
        testCasesTotal: 1,
        testCasesByModule: { 'src/a.ts': 1 },
        testedModules: new Set(['src/a.ts']),
      }),
      measure: { codeLines: 2, fileLines: { 'src/a.ts': 1, 'bot.py': 1 } },
      botHandlers: 0,
      hotspots: [],
    });
    expect(facts).toEqual({
      languages: { html: 1, python: 1, typescript: 4 },
      stacks: ['js', 'python'],
      frameworks: ['aiogram', 'react'],
      domains: [],
      // JS wins for `test`; Python adds the `lint` JS does not have.
      commands: { test: 'npm test', lint: 'python -m ruff check .' },
      scripts: { test: 'npm test', lint: 'python -m ruff check .' },
      sourceFiles: 5,
      modules: 2,
      modulesWithTests: 1,
      testCasesTotal: 1,
      testCasesByModule: { 'src/a.ts': 1 },
      codeLines: 2,
      fileLines: { 'bot.py': 1, 'src/a.ts': 1 },
      botHandlers: 0,
      hotspots: [],
    });
    expect(Object.keys(facts.languages)).toEqual(['html', 'python', 'typescript']);
    expect(Object.keys(facts.fileLines)).toEqual(['bot.py', 'src/a.ts']);
    expect(facts).not.toHaveProperty('coverage');
  });

  it('marks a package.json-only project as js and passes coverage through', () => {
    const facts = buildFacts({
      files: sourceFiles({ 'package.json': '{}', 'index.html': '<p></p>\n' }),
      js: jsProject({ hasPackageJson: true }),
      python: pythonProject(),
      tests: testFacts({ coverage: 0.5 }),
      measure: { codeLines: 0, fileLines: {} },
      botHandlers: 3,
      hotspots: ['index.html'],
    });
    expect(facts.stacks).toEqual(['js']);
    expect(facts.languages).toEqual({ html: 1 });
    expect(facts.coverage).toBe(0.5);
    expect(facts.botHandlers).toBe(3);
    expect(facts.hotspots).toEqual(['index.html']);
  });
});
