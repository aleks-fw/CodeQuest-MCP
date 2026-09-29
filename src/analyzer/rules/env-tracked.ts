import path from 'node:path';
import type { Rule, RuleHit } from './types.js';

// .gitignore lines that hide a root .env; the ones with a leading slash do not reach nested folders.
const ROOT_IGNORE_LINES: readonly string[] = ['.env', '/.env', '.env*', '/.env*', '*.env'];
const NESTED_IGNORE_LINES: readonly string[] = ['.env', '.env*', '*.env'];

export const envTrackedRule: Rule = {
  id: 'generic/env-tracked',
  category: 'security',
  severity: 'high',
  run(ctx) {
    const envFiles = ctx.files.filter((file) => path.posix.basename(file.path) === '.env');
    const hits: RuleHit[] = [];
    if (ctx.isGitRepo) {
      // In a repository every listed file is either tracked or untracked-but-not-ignored.
      for (const file of envFiles) {
        const message = ctx.tracked.has(file.path)
          ? `${file.path} is committed to git`
          : `${file.path} is not ignored by git`;
        hits.push({ file: file.path, message, key: file.path });
      }
      return hits;
    }
    const ignoreLines = new Set((ctx.byPath.get('.gitignore')?.lines ?? []).map((line) => line.trim()));
    for (const file of envFiles) {
      const accepted = file.path.includes('/') ? NESTED_IGNORE_LINES : ROOT_IGNORE_LINES;
      if (accepted.some((line) => ignoreLines.has(line))) continue;
      hits.push({ file: file.path, message: `${file.path} is not listed in .gitignore`, key: file.path });
    }
    return hits;
  },
};
