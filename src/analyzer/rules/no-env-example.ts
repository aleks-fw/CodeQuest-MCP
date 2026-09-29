import type { Rule } from './types.js';

const ENV_READ = /\bprocess\.env\b|\bimport\.meta\.env\b|\bos\.environ\b|\bos\.getenv\s*\(/;
const EXAMPLE_FILES = ['.env.example', '.env.sample', '.env.template'];

export const noEnvExampleRule: Rule = {
  id: 'generic/no-env-example',
  category: 'maintainability',
  severity: 'low',
  run(ctx) {
    if (EXAMPLE_FILES.some((name) => ctx.byPath.has(name))) return [];
    const readers = ctx.files.filter(
      (file) => file.kind === 'code' && file.content !== null && ENV_READ.test(file.content),
    );
    const first = readers[0];
    if (!first) return [];
    const more = readers.length > 1 ? ` and ${readers.length - 1} more` : '';
    // Project-level finding: no file, so the id stays the same when the list of readers changes.
    const message = `Code reads environment variables (${first.path}${more}) but there is no .env.example`;
    return [{ message, key: '' }];
  },
};
