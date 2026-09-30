import { say } from './say.js';
import type { Rule, RuleHit } from './types.js';

const LIMIT = 400;
const HIGH_LIMIT = 800;

export const largeFileRule: Rule = {
  id: 'generic/large-file',
  category: 'architecture',
  severity: 'medium',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if ((file.kind !== 'code' && file.kind !== 'test') || file.content === null) continue;
      const count = file.lines.length;
      if (count <= LIMIT) continue;
      hits.push({
        file: file.path,
        ...say('finding.large-file', { count, limit: LIMIT }),
        // One finding per file: growing from 450 to 500 lines is the same problem, not a new one.
        key: 'size',
        severity: count > HIGH_LIMIT ? 'high' : 'medium',
      });
    }
    return hits;
  },
};
