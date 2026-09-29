import { countFileHandlers } from '../metrics.js';
import type { Rule, RuleHit } from './types.js';

const MAX_HANDLERS = 10;

export const botFatRouterRule: Rule = {
  id: 'bot/fat-router',
  category: 'architecture',
  severity: 'medium',
  pack: 'bot',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      const count = countFileHandlers(file);
      if (count <= MAX_HANDLERS) continue;
      hits.push({
        file: file.path,
        message: `${count} handler registrations in ${file.path}; split them into routers or modules`,
        key: '',
      });
    }
    return hits;
  },
};
