import type { Rule, RuleHit } from './types.js';

export const noTestCommandRule: Rule = {
  id: 'generic/no-test-command',
  category: 'testing',
  severity: 'medium',
  run(ctx) {
    const count = ctx.tests.testFiles.length;
    if (count === 0 || ctx.facts.commands.test) return [];
    const hit: RuleHit = { message: `${count} test files, but no test command runs them`, key: '' };
    if (ctx.byPath.has('package.json')) hit.file = 'package.json';
    return [hit];
  },
};
