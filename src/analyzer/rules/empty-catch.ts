import type { Language } from '../files.js';
import { lineKey } from '../findings.js';
import { JS_LANGUAGES, matchContent } from './text.js';
import type { Rule, RuleHit } from './types.js';

// Content-wide patterns: the empty body may sit on the next line.
const JS_EMPTY_CATCH = /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
const PY_EMPTY_EXCEPT = /\bexcept\b[^\n:]*:[ \t]*(?:\r?\n[ \t]*)?pass\b/g;

function checkFor(language: Language): { pattern: RegExp; message: string } | null {
  if (JS_LANGUAGES.has(language)) return { pattern: JS_EMPTY_CATCH, message: 'Empty catch block swallows the error' };
  if (language === 'python') return { pattern: PY_EMPTY_EXCEPT, message: 'Exception silenced with pass' };
  return null;
}

export const emptyCatchRule: Rule = {
  id: 'generic/empty-catch',
  category: 'reliability',
  severity: 'medium',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      const check = checkFor(file.language);
      if (check === null) continue;
      for (const { line } of matchContent(file, check.pattern)) {
        hits.push({ file: file.path, line, message: check.message, key: lineKey(file.lines[line - 1] ?? '') });
      }
    }
    return hits;
  },
};
