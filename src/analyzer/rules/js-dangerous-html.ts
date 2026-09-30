import { lineKey } from '../findings.js';
import { say } from './say.js';
import { isCommentLine, JS_LANGUAGES, matchLines } from './text.js';
import type { Rule, RuleHit } from './types.js';

const SANITIZER = /DOMPurify|sanitize/i;

export const jsDangerousHtmlRule: Rule = {
  id: 'js/dangerous-html',
  category: 'security',
  severity: 'high',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (!JS_LANGUAGES.has(file.language) || file.kind === 'test' || file.content === null) continue;
      if (!file.content.includes('dangerouslySetInnerHTML') || SANITIZER.test(file.content)) continue;
      for (const { line, text } of matchLines(file, /dangerouslySetInnerHTML/)) {
        if (isCommentLine(text)) continue;
        hits.push({ file: file.path, line, ...say('finding.js-dangerous-html'), key: lineKey(text) });
      }
    }
    return hits;
  },
};
