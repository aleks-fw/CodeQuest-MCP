import { lineKey } from '../findings.js';
import { isCommentLine, JS_LANGUAGES, matchLines } from './text.js';
import type { Rule, RuleHit } from './types.js';

const HANDLER_PATH = /^(?:src\/)?app\/.*\/route\.[cm]?[jt]sx?$|^(?:src\/)?pages\/api\//;
const HANDLER_CODE = /\b(?:app|router|server|fastify)\.(?:get|post|put|patch|delete|all|route)\s*\(/;
const SYNC_NAMES = [
  'readFileSync',
  'writeFileSync',
  'appendFileSync',
  'existsSync',
  'readdirSync',
  'statSync',
  'mkdirSync',
  'unlinkSync',
];
const SYNC_FS = new RegExp(`\\bfs\\.(\\w+Sync)\\s*\\(|\\b(${SYNC_NAMES.join('|')})\\s*\\(`);

export const jsSyncFsInHandlerRule: Rule = {
  id: 'js/sync-fs-in-handler',
  category: 'performance',
  severity: 'medium',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (!JS_LANGUAGES.has(file.language) || file.kind !== 'code' || file.content === null) continue;
      if (!HANDLER_PATH.test(file.path) && !HANDLER_CODE.test(file.content)) continue;
      for (const { line, text, match } of matchLines(file, SYNC_FS)) {
        if (isCommentLine(text)) continue;
        const name = match[1] ?? match[2] ?? 'sync fs call';
        hits.push({
          file: file.path,
          line,
          message: `${name}() blocks the event loop inside a request handler`,
          key: lineKey(text),
        });
      }
    }
    return hits;
  },
};
