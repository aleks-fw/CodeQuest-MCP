import { countFileHandlers } from '../metrics.js';
import { say } from './say.js';
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
        ...say('finding.bot-fat-router', { count, file: file.path }),
        key: '',
      });
    }
    return hits;
  },
};
