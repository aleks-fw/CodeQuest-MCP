import path from 'node:path';
import type { Rule, RuleHit } from './types.js';

// .env and .env.<name> hold real values; .env.example / .sample / .template are meant to be committed.
const TEMPLATE_SUFFIXES: ReadonlySet<string> = new Set(['example', 'sample', 'template']);

export function isEnvFile(filePath: string): boolean {
  const base = path.posix.basename(filePath);
  if (base === '.env') return true;
  if (!base.startsWith('.env.')) return false;
  return !TEMPLATE_SUFFIXES.has(base.slice(base.lastIndexOf('.') + 1).toLowerCase());
}

/** .gitignore lines that hide this file; the ones with a leading slash do not reach nested folders. */
function ignoreLinesFor(filePath: string): string[] {
  const base = path.posix.basename(filePath);
  const names = base === '.env' ? ['.env', '.env*', '*.env'] : [base, '.env*', '.env.*'];
  return filePath.includes('/') ? names : [...names, ...names.map((name) => '/' + name)];
}

export const envTrackedRule: Rule = {
  id: 'generic/env-tracked',
  category: 'security',
  severity: 'high',
  run(ctx) {
    const envFiles = ctx.files.filter((file) => isEnvFile(file.path));
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
      if (ignoreLinesFor(file.path).some((line) => ignoreLines.has(line))) continue;
      hits.push({ file: file.path, message: `${file.path} is not listed in .gitignore`, key: file.path });
    }
    return hits;
  },
};
