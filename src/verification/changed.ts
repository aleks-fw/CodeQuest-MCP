import type { ListedFile } from '../analyzer/files.js';
import { runGit } from '../analyzer/git.js';
import type { Baseline } from '../types.js';

/**
 * Files changed since the quest's "as it was" (spec §8.1): git diff from the remembered HEAD (committed and uncommitted
 * changes of tracked files) plus new files; outside git, by modification time. null when it cannot be told.
 */
export async function readChangedFiles(
  root: string,
  baseline: Pick<Baseline, 'head' | 'takenAt'>,
  files: readonly ListedFile[],
  isGitRepo: boolean,
): Promise<Set<string> | null> {
  if (isGitRepo && baseline.head !== null) {
    const diff = await runGit(root, ['-c', 'core.quotePath=false', 'diff', '--name-only', baseline.head]);
    const added = await runGit(root, ['-c', 'core.quotePath=false', 'ls-files', '--others', '--exclude-standard']);
    if (!diff.ok || !added.ok) return null;
    const names = [...diff.stdout.split(/\r?\n/), ...added.stdout.split(/\r?\n/)].filter((line) => line !== '');
    return new Set(names);
  }
  const since = Date.parse(baseline.takenAt);
  if (!Number.isFinite(since)) return null;
  return new Set(files.filter((file) => file.mtimeMs > since).map((file) => file.path));
}
