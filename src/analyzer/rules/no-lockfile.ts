import { say } from './say.js';
import type { Rule } from './types.js';

export const LOCK_FILES: readonly string[] = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
];

export const noLockfileRule: Rule = {
  id: 'generic/no-lockfile',
  category: 'maintainability',
  severity: 'low',
  run(ctx) {
    // byPath holds every listed file, including unread binary ones such as bun.lockb.
    if (!ctx.byPath.has('package.json') || LOCK_FILES.some((name) => ctx.byPath.has(name))) return [];
    return [{ file: 'package.json', ...say('finding.no-lockfile'), key: '' }];
  },
};
