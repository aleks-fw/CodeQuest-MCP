import { isModule } from '../context.js';
import type { Rule } from './types.js';

export const noTestsRule: Rule = {
  id: 'generic/no-tests',
  category: 'testing',
  severity: 'high',
  run(ctx) {
    const modules = ctx.files.filter((file) => isModule(file)).length;
    if (modules === 0 || ctx.files.some((file) => file.kind === 'test')) return [];
    return [{ message: `${modules} modules and not a single test file`, key: '' }];
  },
};
