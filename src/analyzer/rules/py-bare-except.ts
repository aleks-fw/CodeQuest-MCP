import type { FileKind } from '../files.js';
import { lineKey } from '../findings.js';
import { say } from './say.js';
import { isCommentLine, matchLines } from './text.js';
import type { Rule, RuleHit } from './types.js';

const KINDS: ReadonlySet<FileKind> = new Set(['code', 'config']);
const BARE_EXCEPT = /^\s*except\s*:/;

export const pyBareExceptRule: Rule = {
  id: 'py/bare-except',
  category: 'reliability',
  severity: 'medium',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (file.language !== 'python' || !KINDS.has(file.kind)) continue;
      for (const { line, text } of matchLines(file, BARE_EXCEPT)) {
        if (isCommentLine(text)) continue;
        hits.push({
          file: file.path,
          line,
          ...say('finding.py-bare-except'),
          key: lineKey(text),
        });
      }
    }
    return hits;
  },
};
