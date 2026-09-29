import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const TMP_BASE = path.resolve(import.meta.dirname, '..', '..', '.tmp');

const created: string[] = [];

/** Empty folder whose path has a space and Cyrillic letters: <repo>/.tmp/run XXXXXX/тест проект */
export async function makeTempDir(): Promise<string> {
  await mkdir(TMP_BASE, { recursive: true });
  const base = await mkdtemp(path.join(TMP_BASE, 'run '));
  created.push(base);
  const dir = path.join(base, 'тест проект');
  await mkdir(dir);
  return dir;
}

/** Temp folder with the given files, committed to a fresh git repository. */
export async function makeGitProject(files: Record<string, string> = { 'README.md': '# test\n' }): Promise<string> {
  const dir = await makeTempDir();
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(dir, relative);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  await git(dir, 'init', '-q', '-b', 'main');
  await git(dir, 'add', '-A');
  await git(
    dir,
    '-c',
    'user.name=CodeQuest Test',
    '-c',
    'user.email=test@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-q',
    '-m',
    'init',
  );
  return dir;
}

export async function cleanupTempDirs(): Promise<void> {
  for (const dir of created.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await run('git', args, { cwd, windowsHide: true });
}
