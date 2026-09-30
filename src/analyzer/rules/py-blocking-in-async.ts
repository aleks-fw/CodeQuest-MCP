import type { FileKind } from '../files.js';
import { say } from './say.js';
import { isCommentLine } from './text.js';
import type { Rule, RuleHit } from './types.js';

const KINDS: ReadonlySet<FileKind> = new Set(['code', 'config']);
const ASYNC_DEF = /^(\s*)async\s+def\s+(\w+)/;
const SYNC_DEF = /^\s*def\s+/;
// `requests.get` passed as an argument (asyncio.to_thread(requests.get, url)) has no "(" and is not matched.
const BLOCKING = /(?<![\w.])(time\.sleep|requests\.(?:get|post|put|patch|delete|head|options|request))\s*\(/;

export const pyBlockingInAsyncRule: Rule = {
  id: 'py/blocking-in-async',
  category: 'performance',
  severity: 'high',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (file.language !== 'python' || !KINDS.has(file.kind)) continue;
      const lines = file.lines;
      const reported = new Set<number>();
      for (let index = 0; index < lines.length; index++) {
        const def = ASYNC_DEF.exec(lines[index] ?? '');
        if (!def) continue;
        const defIndent = (def[1] ?? '').length;
        const name = def[2] ?? '';
        // Body of a plain `def` nested in the coroutine usually runs in a thread pool; skip it.
        let skipIndent = -1;
        for (let next = index + 1; next < lines.length; next++) {
          const text = lines[next] ?? '';
          if (text.trim() === '') continue;
          const indent = text.length - text.trimStart().length;
          if (indent <= defIndent) break;
          if (skipIndent >= 0) {
            if (indent > skipIndent) continue;
            skipIndent = -1;
          }
          if (SYNC_DEF.test(text)) {
            skipIndent = indent;
            continue;
          }
          const call = BLOCKING.exec(text)?.[1];
          if (call === undefined || isCommentLine(text) || reported.has(next)) continue;
          reported.add(next);
          hits.push({
            file: file.path,
            line: next + 1,
            ...say('finding.py-blocking', { call, name }),
            key: `${name}:${call}`,
          });
        }
      }
    }
    return hits;
  },
};
