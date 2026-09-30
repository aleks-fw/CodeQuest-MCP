import type { FileKind } from '../files.js';
import { lineKey } from '../findings.js';
import { say } from './say.js';
import { matchLines } from './text.js';
import type { Rule, RuleHit } from './types.js';

const SUPPRESSION_KINDS: ReadonlySet<FileKind> = new Set(['code', 'test', 'config']);

const SUPPRESSIONS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'ts-ignore', pattern: /@ts-ignore/ },
  { name: 'ts-nocheck', pattern: /@ts-nocheck/ },
  { name: 'eslint-disable', pattern: /eslint-disable/ },
  { name: 'noqa', pattern: /#\s*noqa/ },
  { name: 'type-ignore', pattern: /#\s*type:\s*ignore/ },
  { name: 'istanbul', pattern: /istanbul ignore/ },
  { name: 'no-cover', pattern: /pragma:\s*no cover/ },
];

export const suppressionRule: Rule = {
  id: 'generic/suppression',
  category: 'clean-code',
  severity: 'low',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (file.content === null || !SUPPRESSION_KINDS.has(file.kind)) continue;
      for (const { name, pattern } of SUPPRESSIONS) {
        for (const { line, text } of matchLines(file, pattern)) {
          hits.push({
            file: file.path,
            line,
            ...say('finding.suppression', { name }),
            key: `${name}:${lineKey(text)}`,
          });
        }
      }
    }
    return hits;
  },
};
