import type { FileKind } from '../files.js';
import { lineKey } from '../findings.js';
import { isCommentLine, matchLines } from './text.js';
import type { Rule, RuleHit } from './types.js';

const KINDS: ReadonlySet<FileKind> = new Set(['code', 'config']);
// Plain eval( / exec( but not obj.exec( or my_eval(.
const EVAL_PATTERN = /(?<![\w.$])(?:eval|exec)\s*\(/;

export const pyEvalRule: Rule = {
  id: 'py/eval',
  category: 'security',
  severity: 'high',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (file.language !== 'python' || !KINDS.has(file.kind)) continue;
      for (const { line, text } of matchLines(file, EVAL_PATTERN)) {
        if (isCommentLine(text)) continue;
        hits.push({ file: file.path, line, message: `Dynamic code execution: ${lineKey(text)}`, key: lineKey(text) });
      }
    }
    return hits;
  },
};
