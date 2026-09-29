import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { CodeQuestError } from '../errors.js';
import type { ProjectRef } from '../types.js';

const run = promisify(execFile);

/** Finds the project for a path: the enclosing git root, or the folder itself outside git (spec §9.1). */
export async function resolveProject(start: string): Promise<ProjectRef> {
  const dir = path.resolve(start);
  const info = await stat(dir).catch(() => null);
  if (!info) throw new CodeQuestError(`Path not found: ${dir}`);
  if (!info.isDirectory()) throw new CodeQuestError(`Not a folder: ${dir}`);
  const root = (await gitRoot(dir)) ?? dir;
  return { id: projectId(root), name: path.basename(root) || root, root };
}

/** First 12 hex chars of sha256 of the normalized root; case-insensitive on Windows (spec §5). */
export function projectId(root: string, platform: NodeJS.Platform = process.platform): string {
  const key = platform === 'win32' ? path.win32.resolve(root).toLowerCase() : path.posix.resolve(root);
  return createHash('sha256').update(key).digest('hex').slice(0, 12);
}

async function gitRoot(dir: string): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['rev-parse', '--show-toplevel'], { cwd: dir, windowsHide: true });
    const top = stdout.trim();
    return top ? path.resolve(top) : null;
  } catch {
    // Not a repository, or git is missing: the folder itself is the project.
    return null;
  }
}
