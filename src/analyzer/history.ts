import { createHash } from 'node:crypto';
import type { ListedFile } from './files.js';
import { runGit } from './git.js';

export const HOTSPOT_MIN_COMMITS = 10;
export const HOTSPOT_MIN_FIXES = 3;

const FIX_SUBJECT = /(fix|bug|hotfix)/i;
const RECORD_SEPARATOR = '\x1e';
const COMMIT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

/** Current commit id; null outside git and in a repository without commits. */
export async function readHead(root: string): Promise<string | null> {
  const result = await runGit(root, ['rev-parse', 'HEAD']);
  const head = result.stdout.trim();
  // In an empty repository rev-parse echoes the literal "HEAD" before failing, so check the shape too.
  return result.ok && COMMIT_ID.test(head) ? head : null;
}

/** Files changed often and fixed often in the last 90 days, sorted; any git failure → []. */
export async function readHotspots(root: string): Promise<string[]> {
  const result = await runGit(root, [
    '-c',
    'core.quotePath=false',
    'log',
    '--since=90 days ago',
    '--no-merges',
    '--name-only',
    '--format=%x1e%s',
  ]);
  if (!result.ok) return [];
  const commits = new Map<string, number>();
  const fixes = new Map<string, number>();
  // Each record: subject line, blank line, one changed path per line. The text before the first separator is empty.
  for (const record of result.stdout.split(RECORD_SEPARATOR)) {
    const [subject = '', ...rest] = record.split(/\r?\n/);
    const isFix = FIX_SUBJECT.test(subject);
    for (const file of new Set(rest.filter((line) => line.trim() !== ''))) {
      commits.set(file, (commits.get(file) ?? 0) + 1);
      if (isFix) fixes.set(file, (fixes.get(file) ?? 0) + 1);
    }
  }
  const hotspots: string[] = [];
  for (const [file, count] of commits) {
    if (count >= HOTSPOT_MIN_COMMITS && (fixes.get(file) ?? 0) >= HOTSPOT_MIN_FIXES) hotspots.push(file);
  }
  return hotspots.sort();
}

/** Cheap fingerprint of the working tree: the same key means the previous snapshot is still valid. */
export function computeChangeKey(head: string | null, files: ListedFile[]): string {
  // mtime is truncated to whole ms: some file systems report sub-ms noise between two stat calls.
  const lines = files.map((file) => `${file.path}\t${file.size}\t${Math.trunc(file.mtimeMs)}`).sort();
  return createHash('sha256')
    .update(`${head ?? 'no-git'}\n${lines.join('\n')}`)
    .digest('hex')
    .slice(0, 16);
}
