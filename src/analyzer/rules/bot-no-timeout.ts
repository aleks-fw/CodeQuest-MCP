import type { SourceFile } from '../files.js';
import { lineKey } from '../findings.js';
import { say } from './say.js';
import { isCommentLine, matchContent } from './text.js';
import type { Rule, RuleHit } from './types.js';

interface HttpCall {
  pattern: RegExp;
  /** A file-wide setting that gives every call of this client a timeout. */
  globalTimeout?: RegExp;
}

const CLIENTS: readonly HttpCall[] = [
  { pattern: /(?<![\w.$])fetch\s*\(/g },
  {
    pattern: /(?<![\w$])axios(?:\.(?:get|post|put|patch|delete|head|request))?\s*\(/g,
    globalTimeout: /axios\.defaults\.timeout|axios\.create\s*\(\s*\{[^}]*timeout/,
  },
  { pattern: /(?<![\w.])requests\.(?:get|post|put|patch|delete|head|request)\s*\(/g },
  { pattern: /\b\w*[sS]ession\.(?:get|post|put|patch|delete|head|request)\s*\(/g, globalTimeout: /ClientTimeout/ },
];
const TIMEOUT_WORD = /timeout|signal/i;
const MAX_ARGS = 1500;

export const botNoTimeoutRule: Rule = {
  id: 'bot/no-timeout',
  category: 'reliability',
  severity: 'medium',
  pack: 'bot',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (file.kind !== 'code' || file.content === null) continue;
      if (file.language !== 'python' && file.language !== 'typescript' && file.language !== 'javascript') continue;
      hits.push(...callsWithoutTimeout(file, file.content));
    }
    return hits;
  },
};

function callsWithoutTimeout(file: SourceFile, content: string): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const client of CLIENTS) {
    if (client.globalTimeout?.test(content)) continue;
    for (const { line, match } of matchContent(file, client.pattern)) {
      const text = file.lines[line - 1] ?? '';
      if (isCommentLine(text)) continue;
      const args = argumentsAfter(content, match.index + match[0].length);
      if (TIMEOUT_WORD.test(args)) continue;
      hits.push({
        file: file.path,
        line,
        ...say('finding.bot-no-timeout', { line: lineKey(text) }),
        key: lineKey(text),
      });
    }
  }
  return hits.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
}

/** Text up to the bracket that closes the call; capped, and brackets inside strings are counted like any other. */
function argumentsAfter(content: string, from: number): string {
  let depth = 1;
  const end = Math.min(content.length, from + MAX_ARGS);
  for (let index = from; index < end; index++) {
    const char = content.charAt(index);
    if (char === '(') depth++;
    else if (char === ')' && --depth === 0) return content.slice(from, index);
  }
  return content.slice(from, end);
}
