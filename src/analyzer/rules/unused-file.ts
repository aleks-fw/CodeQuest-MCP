import { isModule } from '../context.js';
import type { Rule, RuleHit } from './types.js';

export const unusedFileRule: Rule = {
  id: 'generic/unused-file',
  category: 'clean-code',
  severity: 'low',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (!isModule(file) || !ctx.graphLanguages.has(file.language) || ctx.entryPoints.has(file.path)) continue;
      // Files outside the graph (unreadable) are unknown, not unused.
      const importers = ctx.graph.importedBy.get(file.path);
      if (!importers || importers.length > 0) continue;
      const message = `${file.path} is not imported anywhere and is not an entry point`;
      hits.push({ file: file.path, message, key: '' });
    }
    return hits;
  },
};
