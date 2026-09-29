import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { projectId, resolveProject } from '../../src/engine/project.js';
import { CodeQuestError } from '../../src/errors.js';
import { cleanupTempDirs, makeGitProject, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

describe('resolveProject', () => {
  it('uses the git root when started from a subfolder', async () => {
    const root = await makeGitProject({ 'src/index.ts': 'export {};\n' });
    const project = await resolveProject(path.join(root, 'src'));
    expect(project.root).toBe(path.resolve(root));
    expect(project.name).toBe('тест проект');
    expect(project.id).toBe(projectId(root));
  });

  it('uses the folder itself outside git', async () => {
    const dir = await makeTempDir();
    const project = await resolveProject(dir);
    expect(project.root).toBe(path.resolve(dir));
    expect(project.name).toBe('тест проект');
  });

  it('rejects a missing path with a readable error', async () => {
    const dir = await makeTempDir();
    const missing = path.join(dir, 'нет такой папки');
    await expect(resolveProject(missing)).rejects.toThrow(CodeQuestError);
    await expect(resolveProject(missing)).rejects.toThrow(`Path not found: ${missing}`);
  });

  it('rejects a file with a readable error', async () => {
    const dir = await makeTempDir();
    const file = path.join(dir, 'notes.txt');
    await writeFile(file, 'x');
    await expect(resolveProject(file)).rejects.toThrow(`Not a folder: ${file}`);
  });

  it('works for nested folders with spaces', async () => {
    const root = await makeGitProject();
    const deep = path.join(root, 'a b', 'в г');
    await mkdir(deep, { recursive: true });
    expect((await resolveProject(deep)).root).toBe(path.resolve(root));
  });
});

describe('projectId', () => {
  it('is 12 lowercase hex characters', () => {
    expect(projectId('D:\\Claude\\shop', 'win32')).toMatch(/^[0-9a-f]{12}$/);
  });

  it('ignores case and a trailing slash on Windows', () => {
    expect(projectId('d:\\claude\\SHOP\\', 'win32')).toBe(projectId('D:\\Claude\\shop', 'win32'));
    expect(projectId('D:/Claude/shop', 'win32')).toBe(projectId('D:\\Claude\\shop', 'win32'));
  });

  it('keeps case on other platforms', () => {
    expect(projectId('/home/u/Shop', 'linux')).not.toBe(projectId('/home/u/shop', 'linux'));
  });

  it('differs between folders', () => {
    expect(projectId('D:\\a', 'win32')).not.toBe(projectId('D:\\b', 'win32'));
  });
});
