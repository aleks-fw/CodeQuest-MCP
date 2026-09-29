import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/analyzer/analyze.js';
import { cleanupTempDirs, commitAll, initGitRepo, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

const FILES = 1000;
const LIMIT_MS = 10_000;

function moduleName(index: number): string {
  return `mod${String(index).padStart(4, '0')}`;
}

/** 30 lines; every module imports the previous one, so the import graph is one long chain. */
function moduleSource(index: number): string {
  const start = index > 0 ? `total${index - 1}(values)` : '0';
  const lines = [
    index > 0 ? `import { total${index - 1} } from './${moduleName(index - 1)}.js';` : '// first module',
    '',
    `export function total${index}(values: number[]): number {`,
    `  let sum = ${start};`,
  ];
  // Constants differ per file, so no 8-line window repeats anywhere.
  for (let k = 0; k < 24; k += 1) lines.push(`  sum += values[${k}] ?? ${index * 31 + k};`);
  lines.push('  return sum;', '}');
  return `${lines.join('\n')}\n`;
}

describe('performance', () => {
  it(`analyzes ${FILES} code files in under ${LIMIT_MS} ms`, async () => {
    const root = await makeTempDir();
    await mkdir(path.join(root, 'src'));
    for (let index = 0; index < FILES; index += 1) {
      await writeFile(path.join(root, 'src', `${moduleName(index)}.ts`), moduleSource(index));
    }
    await initGitRepo(root);
    await commitAll(root, 'generated modules');

    const started = performance.now();
    const snapshot = await analyzeProject(root, { now: new Date('2026-09-29T00:00:00.000Z') });
    const elapsed = performance.now() - started;

    expect(snapshot.errors).toEqual([]);
    expect(snapshot.facts.modules).toBe(FILES);
    expect(elapsed, `analyzeProject took ${elapsed} ms (limit ${LIMIT_MS})`).toBeLessThan(LIMIT_MS);
  }, 120_000);
});
