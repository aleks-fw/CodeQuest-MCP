import type { Language } from '../files.js';
import { lineKey } from '../findings.js';
import type { Rule, RuleHit } from './types.js';

const TODO_LANGUAGES: ReadonlySet<Language> = new Set(['typescript', 'javascript', 'python', 'html', 'css']);
// Linear scan: find the marker first, then check that a comment opener precedes it on the same line.
// A single regex with a lazy gap before the marker is quadratic on long minified lines.
const MARKER = /\b(TODO|FIXME|HACK|XXX)\b/g;
const OPENERS: readonly string[] = ['//', '/*', '#', '<!--'];
// `*/` or `-->` closing the comment on the same line is not part of the note.
const MARKER_TAIL = /^[:\s-]*/;
const COMMENT_END = /\s*(?:\*\/|-->)\s*$/;

/** End index of the first comment opener on the line (`*` counts only as the first character), or -1. */
function firstOpenerEnd(line: string): number {
  let best = -1;
  for (const opener of OPENERS) {
    const at = line.indexOf(opener);
    if (at >= 0 && (best === -1 || at + opener.length < best)) best = at + opener.length;
  }
  const lead = line.length - line.trimStart().length;
  if (line[lead] === '*' && (best === -1 || lead + 1 < best)) best = lead + 1;
  return best;
}

function findTodo(line: string): { marker: string; rest: string } | null {
  const openerEnd = firstOpenerEnd(line);
  if (openerEnd === -1) return null;
  for (const match of line.matchAll(MARKER)) {
    const at = match.index;
    if (at < openerEnd) continue;
    const before = line.slice(Math.max(0, at - 4), at);
    const glued = at === openerEnd || OPENERS.some((opener) => before.endsWith(opener));
    if (!glued && !/\s$/.test(before)) continue;
    const rest = line.slice(at + match[0].length);
    return { marker: match[1] ?? '', rest: rest.replace(MARKER_TAIL, '') };
  }
  return null;
}
export const todoRule: Rule = {
  id: 'generic/todo',
  category: 'clean-code',
  severity: 'low',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (file.content === null || !TODO_LANGUAGES.has(file.language)) continue;
      for (const [index, source] of file.lines.entries()) {
        const found = findTodo(source);
        if (found === null) continue;
        const line = index + 1;
        const marker = found.marker;
        const text = found.rest.replace(COMMENT_END, '').trim();
        hits.push({
          file: file.path,
          line,
          message: text ? `${marker}: ${text}` : marker,
          key: `${marker}:${lineKey(text).toLowerCase()}`,
        });
      }
    }
    return hits;
  },
};
