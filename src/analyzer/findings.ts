import { createHash } from 'node:crypto';
import type { Finding } from '../types.js';
import type { Rule, RuleHit } from './rules/types.js';

export function findingId(rule: string, file: string | undefined, key: string): string {
  return createHash('sha256')
    .update(`${rule}\n${file ?? ''}\n${key}`)
    .digest('hex')
    .slice(0, 16);
}

/** Normalized line text for keys: stable when the line moves or its indentation changes. */
export function lineKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function toFindings(rule: Rule, hits: RuleHit[]): Finding[] {
  const seen = new Map<string, number>();
  return hits.map((hit) => {
    const slot = `${hit.file ?? ''}\n${hit.key}`;
    const count = (seen.get(slot) ?? 0) + 1;
    seen.set(slot, count);
    // Repeats are numbered in hit order, so the id never depends on a line number.
    const key = count === 1 ? hit.key : `${hit.key}#${count}`;
    return {
      id: findingId(rule.id, hit.file, key),
      rule: rule.id,
      category: rule.category,
      severity: hit.severity ?? rule.severity,
      ...(hit.file === undefined ? {} : { file: hit.file }),
      ...(hit.line === undefined ? {} : { line: hit.line }),
      message: hit.message,
      ...(hit.text === undefined ? {} : { text: hit.text }),
      key,
    };
  });
}
