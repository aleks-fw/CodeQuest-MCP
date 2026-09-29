import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SourceFile } from './files.js';
import type { ImportGraph } from './import-graph.js';

export interface TestFacts {
  /** Paths of kind 'test' files, sorted. */
  testFiles: string[];
  casesByFile: Record<string, number>;
  assertionsByFile: Record<string, number>;
  testCasesTotal: number;
  /** Code module → sum of the cases of the test files that import it directly. */
  testCasesByModule: Record<string, number>;
  testedModules: Set<string>;
  /** Line coverage 0..1 from a report on disk, when one exists. */
  coverage?: number;
}

// Lookbehind drops xit(, obj.it( and it.skip( (the latter never reaches "\s*\(").
const JS_CASE = /(?<![\w.$])(?:it|test)(?:\.only)?\s*\(/g;
const JS_ASSERTIONS: readonly RegExp[] = [/\bexpect\s*\(/g, /\bassert(?:\.\w+)?\s*\(/g];
const PY_CASE = /^\s*(?:async\s+)?def\s+test_\w*\s*\(/;
const PY_SKIP_DECORATOR = /^\s*@(?:pytest\.mark\.skip|unittest\.skip)/;
const PY_ASSERTIONS: readonly RegExp[] = [/^\s*assert\b/gm, /\bself\.assert\w+\s*\(/g];
const XML_LINE_RATE = /<coverage\b[^>]*?\sline-rate="([\d.]+)"/;

export function countTestCases(file: SourceFile): number {
  if (file.content === null) return 0;
  if (file.language === 'python') return countPythonCases(file.lines);
  return isJsLike(file) ? countMatches(file.content, JS_CASE) : 0;
}

export function countAssertions(file: SourceFile): number {
  const content = file.content;
  if (content === null) return 0;
  return assertionPatterns(file).reduce((sum, pattern) => sum + countMatches(content, pattern), 0);
}

export function collectTestFacts(files: SourceFile[], graph: ImportGraph): TestFacts {
  const byPath = new Map<string, SourceFile>(files.map((file) => [file.path, file]));
  const testFiles = files
    .filter((file) => file.kind === 'test')
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const cases = new Map<string, number>();
  const assertions = new Map<string, number>();
  const casesByModule = new Map<string, number>();
  let testCasesTotal = 0;
  for (const testFile of testFiles) {
    const count = countTestCases(testFile);
    cases.set(testFile.path, count);
    assertions.set(testFile.path, countAssertions(testFile));
    testCasesTotal += count;
    for (const target of graph.runtimeImports.get(testFile.path) ?? []) {
      if (byPath.get(target)?.kind !== 'code') continue;
      casesByModule.set(target, (casesByModule.get(target) ?? 0) + count);
    }
  }
  const modules = [...casesByModule.keys()].sort();
  return {
    testFiles: testFiles.map((testFile) => testFile.path),
    casesByFile: Object.fromEntries(cases),
    assertionsByFile: Object.fromEntries(assertions),
    testCasesTotal,
    testCasesByModule: Object.fromEntries(modules.map((name) => [name, casesByModule.get(name) ?? 0])),
    testedModules: new Set(modules),
  };
}

/** Reads coverage reports straight from disk: they are usually git-ignored, so listFiles never sees them. */
export async function readCoverage(root: string): Promise<number | undefined> {
  const summary = await readOptional(path.join(root, 'coverage', 'coverage-summary.json'));
  const fromSummary = summary === null ? undefined : summaryLineRate(summary);
  if (fromSummary !== undefined) return fromSummary;
  const xml = await readOptional(path.join(root, 'coverage.xml'));
  const rate = xml?.match(XML_LINE_RATE)?.[1];
  const value = rate === undefined ? Number.NaN : Number(rate);
  return Number.isFinite(value) ? value : undefined;
}

function isJsLike(file: SourceFile): boolean {
  return file.language === 'typescript' || file.language === 'javascript';
}

function assertionPatterns(file: SourceFile): readonly RegExp[] {
  if (file.language === 'python') return PY_ASSERTIONS;
  return isJsLike(file) ? JS_ASSERTIONS : [];
}

function countMatches(content: string, pattern: RegExp): number {
  return content.match(pattern)?.length ?? 0;
}

function countPythonCases(lines: string[]): number {
  let count = 0;
  let previous = '';
  for (const line of lines) {
    if (line.trim() === '') continue;
    // Only a decorator on the previous non-blank line skips the test; a skip elsewhere does not.
    if (PY_CASE.test(line) && !PY_SKIP_DECORATOR.test(previous)) count++;
    previous = line;
  }
  return count;
}

function summaryLineRate(text: string): number | undefined {
  try {
    const parsed = JSON.parse(text) as { total?: { lines?: { pct?: unknown } } } | null;
    const pct = parsed?.total?.lines?.pct;
    // Istanbul writes "Unknown" when there are no lines, hence the type check.
    return typeof pct === 'number' && Number.isFinite(pct) ? pct / 100 : undefined;
  } catch {
    return undefined;
  }
}

function readOptional(file: string): Promise<string | null> {
  return readFile(file, 'utf8').catch(() => null);
}
