import type { Rule } from './types.js';

const README = /^readme(\.\w+)?$/i;
const MIN_LINES = 10;

export const noReadmeRule: Rule = {
  id: 'generic/no-readme',
  category: 'maintainability',
  severity: 'low',
  run(ctx) {
    // Only the root README describes the project; docs/README.md does not count.
    const readme = ctx.files.find((file) => !file.path.includes('/') && README.test(file.path));
    if (!readme) return [{ message: 'Project has no README', key: '' }];
    if (readme.content === null) return [];
    const lines = readme.lines.filter((line) => line.trim() !== '').length;
    if (lines >= MIN_LINES) return [];
    // No `file`: the finding keeps one identity whether the README is missing or too short.
    return [{ message: `${readme.path} has only ${lines} non-empty lines (need ${MIN_LINES}+)`, key: '' }];
  },
};
