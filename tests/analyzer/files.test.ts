import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { kindOf, languageOf, listFiles, loadFiles, MAX_READ_BYTES, toSourceFile } from '../../src/analyzer/files.js';
import { cleanupTempDirs, makeGitProject, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

async function put(root: string, relative: string, content: string | Buffer): Promise<void> {
  const full = path.join(root, relative);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

describe('listFiles', () => {
  it('lists tracked and untracked files but not ignored ones, with / separators', async () => {
    const root = await makeGitProject({
      'src/модуль.ts': 'export const a = 1;\n',
      '.gitignore': 'secret.txt\n',
      'README.md': '# x\n',
    });
    await put(root, 'src/new.ts', 'export {};\n');
    await put(root, 'secret.txt', 'hidden');
    const listing = await listFiles(root);
    const paths = listing.files.map((file) => file.path);
    expect(listing.isGitRepo).toBe(true);
    expect(paths).toEqual(['.gitignore', 'README.md', 'src/new.ts', 'src/модуль.ts']);
    expect(listing.tracked.has('src/модуль.ts')).toBe(true);
    expect(listing.tracked.has('src/new.ts')).toBe(false);
    expect(listing.files[0]?.size).toBeGreaterThan(0);
  });

  it('walks folders outside git and skips build and dependency folders', async () => {
    const root = await makeTempDir();
    await put(root, 'a.js', 'x');
    await put(root, 'node_modules/x/index.js', 'x');
    await put(root, 'dist/b.js', 'x');
    await put(root, 'sub/c.py', 'x');
    const listing = await listFiles(root);
    expect(listing.isGitRepo).toBe(false);
    expect(listing.files.map((file) => file.path)).toEqual(['a.js', 'sub/c.py']);
    expect(listing.tracked.size).toBe(0);
  });
});

describe('loadFiles', () => {
  it('skips big and binary files and splits CRLF lines', async () => {
    const root = await makeTempDir();
    await put(root, 'big.ts', 'x'.repeat(MAX_READ_BYTES + 1));
    await put(root, 'image.ts', Buffer.from([1, 2, 0, 3]));
    await put(root, 'crlf.ts', '﻿a\r\nb\r\n');
    const files = await loadFiles(root, (await listFiles(root)).files);
    const byPath = new Map(files.map((file) => [file.path, file]));
    expect(byPath.get('big.ts')?.content).toBeNull();
    expect(byPath.get('image.ts')?.content).toBeNull();
    expect(byPath.get('crlf.ts')?.content).toBe('a\r\nb\r\n');
    expect(byPath.get('crlf.ts')?.lines).toEqual(['a', 'b']);
  });
});

describe('classification', () => {
  it.each([
    ['src/a.ts', 'code', 'typescript'],
    ['src/a.test.ts', 'test', 'typescript'],
    ['src/__tests__/a.js', 'test', 'javascript'],
    ['vitest.config.ts', 'config', 'typescript'],
    ['types.d.ts', 'code', 'typescript'],
    ['tests/test_bot.py', 'test', 'python'],
    ['bot/handlers_test.py', 'test', 'python'],
    ['tests/helpers.py', 'test', 'python'],
    ['tests/conftest.py', 'config', 'python'],
    ['setup.py', 'config', 'python'],
    ['index.html', 'other', 'html'],
    ['styles.css', 'other', 'css'],
    ['README.md', 'other', 'other'],
  ] as const)('%s → %s / %s', (filePath, kind, language) => {
    expect(kindOf(filePath)).toBe(kind);
    expect(languageOf(filePath)).toBe(language);
  });

  it('builds a SourceFile from text without a trailing empty line', () => {
    const file = toSourceFile({ path: 'a.py', size: 4, mtimeMs: 0 }, 'x\ny\n');
    expect(file).toMatchObject({ language: 'python', kind: 'code', lines: ['x', 'y'] });
  });
});
