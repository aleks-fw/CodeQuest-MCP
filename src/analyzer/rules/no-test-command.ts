import { say } from './say.js';
import type { Rule, RuleHit } from './types.js';

export const noTestCommandRule: Rule = {
  id: 'generic/no-test-command',
  category: 'testing',
  severity: 'medium',
  run(ctx) {
    const count = ctx.tests.testFiles.length;
    if (count === 0 || ctx.facts.commands.test) return [];
    // No `file`: adding a package.json must not change the finding's identity.
    const hit: RuleHit = { ...say('finding.no-test-command', { count }), key: '' };
    return [hit];
  },
};
