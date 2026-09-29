import { isModule } from '../context.js';
import type { Rule, RuleHit } from './types.js';

const MIN_LINES = 5;
const MONEY_PATH = /payment|checkout|order/i;

export const untestedModuleRule: Rule = {
  id: 'generic/untested-module',
  category: 'testing',
  severity: 'medium',
  run(ctx) {
    const hits: RuleHit[] = [];
    const shop = ctx.facts.domains.some((domain) => domain.pack === 'shop');
    for (const file of ctx.files) {
      if (!isModule(file) || !ctx.graphLanguages.has(file.language)) continue;
      if (ctx.entryPoints.has(file.path) || ctx.tests.testedModules.has(file.path)) continue;
      if (file.lines.filter((line) => line.trim() !== '').length < MIN_LINES) continue;
      const importers = ctx.graph.importedBy.get(file.path) ?? [];
      // "Used" means a non-test file imports it (spec §3.3, plan decisions).
      if (!importers.some((importer) => ctx.byPath.get(importer)?.kind !== 'test')) continue;
      hits.push({
        file: file.path,
        message: `${file.path} is used by the project, but no test imports it`,
        key: '',
        // The shop pack treats untested payment and checkout code as high risk (spec §3.3).
        ...(shop && MONEY_PATH.test(file.path) ? { severity: 'high' as const } : {}),
      });
    }
    return hits;
  },
};
