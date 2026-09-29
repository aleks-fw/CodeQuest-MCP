import { lineKey } from '../findings.js';
import { isCommentLine, JS_LANGUAGES, matchLines } from './text.js';
import type { Rule, RuleHit } from './types.js';

// CLI entry points and one-off scripts print to the console on purpose.
const SKIPPED_FOLDERS: ReadonlySet<string> = new Set(['scripts', 'bin']);
const LOG_PATTERN = /\bconsole\.log\s*\(/;

function inSkippedFolder(filePath: string): boolean {
  return filePath
    .split('/')
    .slice(0, -1)
    .some((folder) => SKIPPED_FOLDERS.has(folder));
}

export const jsDebugLogRule: Rule = {
  id: 'js/debug-log',
  category: 'clean-code',
  severity: 'low',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (!JS_LANGUAGES.has(file.language) || file.kind !== 'code' || inSkippedFolder(file.path)) continue;
      for (const { line, text } of matchLines(file, LOG_PATTERN)) {
        if (isCommentLine(text)) continue;
        hits.push({ file: file.path, line, message: 'console.log left in code', key: lineKey(text) });
      }
    }
    return hits;
  },
};
