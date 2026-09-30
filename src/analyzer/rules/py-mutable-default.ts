import type { FileKind, SourceFile } from '../files.js';
import { say } from './say.js';
import { isCommentLine, matchContent } from './text.js';
import type { Rule, RuleHit } from './types.js';

const KINDS: ReadonlySet<FileKind> = new Set(['code', 'config']);
// Parameters up to the closing bracket; one level of nested brackets (`x=list()`) is allowed. Capped so a stray
// `def f(` cannot scan the whole file.
const DEF = /\bdef\s+(\w+)\s*\(((?:[^()]|\([^()]*\)){0,2000})\)/g;
const MUTABLE = /^\*{0,2}([A-Za-z_]\w*)\s*(?::[\s\S]*?)?=\s*(?:\[\s*\]|\{\s*\}|(?:set|list|dict)\s*\(\s*\))$/;

export const pyMutableDefaultRule: Rule = {
  id: 'py/mutable-default',
  category: 'bug',
  severity: 'medium',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (file.language !== 'python' || !KINDS.has(file.kind)) continue;
      for (const { line, match } of matchContent(file, DEF)) {
        if (isCommentLine(file.lines[line - 1] ?? '')) continue;
        hits.push(...mutableParams(file, line, match[1] ?? '', match[2] ?? ''));
      }
    }
    return hits;
  },
};

function mutableParams(file: SourceFile, defLine: number, fn: string, params: string): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const { text, offset } of splitTopLevel(params)) {
    const found = MUTABLE.exec(text.trim());
    if (!found) continue;
    const name = found[1] ?? '';
    const line = defLine + countNewlines(params.slice(0, offset + (text.length - text.trimStart().length)));
    hits.push({
      file: file.path,
      line,
      ...say('finding.py-mutable-default', { name, fn }),
      key: `${fn}(${name})`,
    });
  }
  return hits;
}

/** Splits on commas outside brackets and strings, keeping each piece's offset. */
function splitTopLevel(params: string): { text: string; offset: number }[] {
  const pieces: { text: string; offset: number }[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let index = 0; index < params.length; index++) {
    const char = params.charAt(index);
    if (quote !== '') {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if ('([{'.includes(char)) {
      depth++;
    } else if (')]}'.includes(char)) {
      depth--;
    } else if (char === ',' && depth === 0) {
      pieces.push({ text: params.slice(start, index), offset: start });
      start = index + 1;
    }
  }
  pieces.push({ text: params.slice(start), offset: start });
  return pieces;
}

function countNewlines(text: string): number {
  let count = 0;
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 10) count++;
  }
  return count;
}
