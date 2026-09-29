import type { Language } from '../files.js';
import { lineKey } from '../findings.js';
import { matchLines } from './text.js';
import type { Rule, RuleHit } from './types.js';

const TODO_LANGUAGES: ReadonlySet<Language> = new Set(['typescript', 'javascript', 'python', 'html', 'css']);
const TODO_PATTERN = /(?:\/\/|\/\*|^\s*\*|#|<!--)\s*(?:.*?\s)?(TODO|FIXME|HACK|XXX)\b[:\s-]*(.*)$/;
// `*/` or `-->` closing the comment on the same line is not part of the note.
const COMMENT_END = /\s*(?:\*\/|-->)\s*$/;

export const todoRule: Rule = {
  id: 'generic/todo',
  category: 'clean-code',
  severity: 'low',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (file.content === null || !TODO_LANGUAGES.has(file.language)) continue;
      for (const { line, match } of matchLines(file, TODO_PATTERN)) {
        const marker = match[1] ?? '';
        const text = (match[2] ?? '').replace(COMMENT_END, '').trim();
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
