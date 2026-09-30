import { createHash } from 'node:crypto';
import type { SourceFile } from '../files.js';
import { say } from './say.js';
import { isCommentLine } from './text.js';
import type { Rule, RuleHit } from './types.js';

/** Minimal block size, in significant lines (spec §3.3). */
export const WINDOW = 8;
const MAX_LISTED = 5;

const NOT_SIGNIFICANT: readonly RegExp[] = [
  /^import\b/, // import x from 'y'; import 'y'; Python import x
  /^export\b.*\bfrom\s*['"]/, // re-exports
  /^from\s+\S+\s+import\b/, // Python from x import y
  /^(?:const|let|var)\s+[^=]+=\s*require\s*\(/, // CommonJS require
  /^[\s{}()[\];,.:<>/]*$/, // brackets and punctuation only (also blank)
];

export interface SignificantLine {
  /** 1-based line number in the file. */
  line: number;
  /** Trimmed text with whitespace runs collapsed to one space. */
  text: string;
}

interface Location {
  file: string;
  /** Window index = index of its first significant line. */
  index: number;
  line: number;
}

interface Run extends Location {
  hash: string;
}

export function significantLines(file: SourceFile): SignificantLine[] {
  const result: SignificantLine[] = [];
  for (const [index, raw] of file.lines.entries()) {
    const text = raw.trim().replace(/\s+/g, ' ');
    if (isCommentLine(text) || NOT_SIGNIFICANT.some((pattern) => pattern.test(text))) continue;
    result.push({ line: index + 1, text });
  }
  return result;
}

export function findDuplicateBlocks(files: readonly SourceFile[]): RuleHit[] {
  const locations = new Map<string, Location[]>();
  const windows: { file: string; hashes: string[]; lines: number[] }[] = [];
  for (const file of files) {
    if (file.kind !== 'code' || file.content === null) continue;
    const significant = significantLines(file);
    const hashes: string[] = [];
    const lines: number[] = [];
    for (let index = 0; index + WINDOW <= significant.length; index += 1) {
      const block = significant.slice(index, index + WINDOW);
      const hash = hashOf(block.map((entry) => entry.text).join('\n'));
      const line = block[0]?.line ?? 0;
      hashes.push(hash);
      lines.push(line);
      const list = locations.get(hash);
      const location = { file: file.path, index, line };
      if (list) list.push(location);
      else locations.set(hash, [location]);
    }
    windows.push({ file: file.path, hashes, lines });
  }

  const runs: Run[] = [];
  for (const entry of windows) {
    let previous = -2;
    for (const [index, hash] of entry.hashes.entries()) {
      if (!isDuplicated(locations.get(hash) ?? [])) continue;
      if (index !== previous + 1) runs.push({ file: entry.file, index, line: entry.lines[index] ?? 0, hash });
      previous = index;
    }
  }
  runs.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));

  const reported = new Set<string>();
  const hits: RuleHit[] = [];
  for (const run of runs) {
    if (reported.has(run.hash)) continue;
    const others = (locations.get(run.hash) ?? [])
      .filter((at) => at.file !== run.file || Math.abs(at.index - run.index) >= WINDOW)
      .map((at) => `${at.file}:${at.line}`);
    if (others.length === 0) continue;
    reported.add(run.hash);
    const listed = others.slice(0, MAX_LISTED).join(', ');
    const extra = others.length - MAX_LISTED;
    const text =
      extra > 0
        ? say('finding.duplicate-block.more', { listed, n: extra })
        : say('finding.duplicate-block', { listed });
    hits.push({ file: run.file, line: run.line, ...text, key: run.hash });
  }
  return hits;
}

/** Two places in different files, or two non-overlapping places in one file. */
function isDuplicated(list: readonly Location[]): boolean {
  const first = list[0];
  if (!first) return false;
  return list.some((at) => at.file !== first.file || at.index - first.index >= WINDOW);
}

function hashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export const duplicateBlockRule: Rule = {
  id: 'generic/duplicate-block',
  category: 'clean-code',
  severity: 'medium',
  run: (ctx) => findDuplicateBlocks(ctx.files),
};
