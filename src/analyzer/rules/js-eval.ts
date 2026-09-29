import type { FileKind } from '../files.js';
import { lineKey } from '../findings.js';
import { isCommentLine, JS_LANGUAGES, matchLines } from './text.js';
import type { Rule, RuleHit } from './types.js';

const EVAL_KINDS: ReadonlySet<FileKind> = new Set(['code', 'config']);
// Plain eval( but not sandbox.eval( or myeval(.
const EVAL_PATTERN = /(?<![\w.$])eval\s*\(|\bnew\s+Function\s*\(/;

export const jsEvalRule: Rule = {
  id: 'js/eval',
  category: 'security',
  severity: 'high',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (!JS_LANGUAGES.has(file.language) || !EVAL_KINDS.has(file.kind)) continue;
      for (const { line, text } of matchLines(file, EVAL_PATTERN)) {
        if (isCommentLine(text)) continue;
        hits.push({ file: file.path, line, message: `Dynamic code execution: ${lineKey(text)}`, key: lineKey(text) });
      }
    }
    return hits;
  },
};
