import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { computeChangeKey, readHead, readHotspots } from '../../src/analyzer/history.js';
import { cleanupTempDirs, commitAll, initGitRepo, makeGitProject, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

// 3 fix-like subjects + 6 others; with the initial commit hot.ts gets 10 commits, warm.ts 9.
const SUBJECTS = [
  'fix: cart total',
  'Bug in rounding',
  'hotfix login',
  'feat: step 1',
  'feat: step 2',
  'feat: step 3',
  'feat: step 4',
  'feat: step 5',
  'feat: step 6',
];

describe('readHotspots', () => {
  it('reports files with 10+ commits and 3+ fixes in the last 90 days', { timeout: 60_000 }, async () => {
    const dir = await makeGitProject({ 'src/hot.ts': 'export const v = 0;\n', 'src/warm.ts': 'export const v = 0;\n' });
    for (const [index, subject] of SUBJECTS.entries()) {
      await writeFile(path.join(dir, 'src', 'hot.ts'), `export const v = ${index + 1};\n`);
      if (index < 8) await writeFile(path.join(dir, 'src', 'warm.ts'), `export const v = ${index + 1};\n`);
      await commitAll(dir, subject);
    }
    expect(await readHotspots(dir)).toEqual(['src/hot.ts']);
  });

  it('returns [] outside git and in a repository without commits', async () => {
    const plain = await makeTempDir();
    const empty = await makeTempDir();
    await initGitRepo(empty);
    expect(await readHotspots(plain)).toEqual([]);
    expect(await readHotspots(empty)).toEqual([]);
  });
});

describe('readHead', () => {
  it('returns the commit id and follows new commits', async () => {
    const dir = await makeGitProject();
    const first = await readHead(dir);
    expect(first).toMatch(/^[0-9a-f]{40}$/);
    await commitAll(dir, 'empty commit');
    const second = await readHead(dir);
    expect(second).toMatch(/^[0-9a-f]{40}$/);
    expect(second).not.toBe(first);
  });

  it('returns null in an empty repository and outside git', async () => {
    const plain = await makeTempDir();
    const empty = await makeTempDir();
    await initGitRepo(empty);
    expect(await readHead(plain)).toBeNull();
    expect(await readHead(empty)).toBeNull();
  });
});

describe('computeChangeKey', () => {
  const a = { path: 'a.ts', size: 10, mtimeMs: 1000.7 };
  const b = { path: 'b.ts', size: 5, mtimeMs: 2000 };

  it('is stable for the same input, file order and sub-millisecond mtime noise', () => {
    const key = computeChangeKey('abc', [a, b]);
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(computeChangeKey('abc', [{ ...a }, { ...b }])).toBe(key);
    expect(computeChangeKey('abc', [b, a])).toBe(key);
    expect(computeChangeKey('abc', [{ ...a, mtimeMs: 1000.2 }, b])).toBe(key);
  });

  it('changes with a file size, the head or the file set', () => {
    const key = computeChangeKey('abc', [a, b]);
    expect(computeChangeKey('abc', [{ ...a, size: 11 }, b])).not.toBe(key);
    expect(computeChangeKey('def', [a, b])).not.toBe(key);
    expect(computeChangeKey(null, [a, b])).not.toBe(key);
    expect(computeChangeKey('abc', [a])).not.toBe(key);
  });
});
