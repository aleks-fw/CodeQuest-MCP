import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const TMP_BASE = path.resolve(import.meta.dirname, '..', '..', '.tmp');

const created: string[] = [];

// Fixed identity and no signing: tests must not depend on the developer's git config.
const COMMIT_FLAGS = [
  '-c',
  'user.name=CodeQuest Test',
  '-c',
  'user.email=test@example.invalid',
  '-c',
  'commit.gpgsign=false',
];

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
  await initGitRepo(dir);
  await commitAll(dir, 'init');
  return dir;
}

/** `git init` on branch main, whatever the user's init.defaultBranch is. */
export async function initGitRepo(dir: string): Promise<void> {
  await git(dir, 'init', '-q', '-b', 'main');
}

/** Stages everything and commits; --allow-empty lets tests add history without touching files. */
export async function commitAll(dir: string, message: string): Promise<void> {
  await git(dir, 'add', '-A');
  await git(dir, ...COMMIT_FLAGS, 'commit', '-q', '--allow-empty', '-m', message);
}

export async function cleanupTempDirs(): Promise<void> {
  for (const dir of created.splice(0)) {
    // Windows may still hold a folder for a moment after a git or node child exits.
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await run('git', args, { cwd, windowsHide: true });
}
