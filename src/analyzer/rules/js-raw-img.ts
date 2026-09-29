import { lineKey } from '../findings.js';
import { isCommentLine, matchLines } from './text.js';
import type { Rule, RuleHit } from './types.js';

const JSX_FILE = /\.[jt]sx$/;
const MESSAGE = 'Raw <img> in a Next.js project: next/image resizes and lazy-loads images';

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
        hits.push({ file: file.path, line, message: MESSAGE, key: lineKey(text) });
      }
    }
    return hits;
  },
};
