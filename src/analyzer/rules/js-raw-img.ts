import { lineKey } from '../findings.js';
import { say } from './say.js';
import { isCommentLine, matchLines } from './text.js';
import type { Rule, RuleHit } from './types.js';

const JSX_FILE = /\.[jt]sx$/;

export const jsRawImgRule: Rule = {
  id: 'js/raw-img',
  category: 'performance',
  severity: 'low',
  run(ctx) {
    if (!ctx.facts.frameworks.includes('next')) return [];
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (!JSX_FILE.test(file.path) || file.kind === 'test' || file.content === null) continue;
      for (const { line, text } of matchLines(file, /<img\b/)) {
        if (isCommentLine(text)) continue;
        hits.push({ file: file.path, line, ...say('finding.js-raw-img'), key: lineKey(text) });
      }
    }
    return hits;
  },
};
