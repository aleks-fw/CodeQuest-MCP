import { lineKey } from '../findings.js';
import { isCommentLine } from './text.js';
import type { Rule, RuleHit } from './types.js';

const SKIP_PATTERNS: readonly RegExp[] = [
  /\b(?:it|test|describe)\.skip\s*\(/,
  // xit( / xtest( / xdescribe( — but not maxit( or obj.xit(
  /(?<![\w.$])x(?:it|test|describe)\s*\(/,
  /@pytest\.mark\.skip/,
  /@unittest\.skip/,
];

export const skippedTestRule: Rule = {
  id: 'generic/skipped-test',
  category: 'testing',
  severity: 'low',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (file.kind !== 'test' || file.content === null) continue;
      for (const [index, text] of file.lines.entries()) {
        if (isCommentLine(text) || !SKIP_PATTERNS.some((pattern) => pattern.test(text))) continue;
        hits.push({ file: file.path, line: index + 1, message: `Skipped test: ${lineKey(text)}`, key: lineKey(text) });
      }
    }
    return hits;
  },
};
