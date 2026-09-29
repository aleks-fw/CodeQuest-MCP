import { describe, expect, it } from 'vitest';
import { toSourceFile } from '../../src/analyzer/files.js';
import { isCommentLine, matchContent, matchLines } from '../../src/analyzer/rules/text.js';

function file(filePath: string, content: string | null) {
  return toSourceFile({ path: filePath, size: content?.length ?? 0, mtimeMs: 0 }, content);
}

describe('isCommentLine', () => {
  it.each([
    ['// note', true],
    ['   /* block', true],
    [' * jsdoc line', true],
    ['# python', true],
    ['<!-- html -->', true],
    ['const a = 1; // trailing', false],
    ['', false],
  ] as const)('%j → %s', (text, expected) => {
    expect(isCommentLine(text)).toBe(expected);
  });
});

describe('matchLines', () => {
  it('returns 1-based lines and ignores the global flag of the pattern', () => {
    const matches = matchLines(file('a.ts', 'a\nfoo 1\nb\nfoo 2\n'), /foo (\d)/g);
    expect(matches.map((m) => [m.line, m.text, m.match[1]])).toEqual([
      [2, 'foo 1', '1'],
      [4, 'foo 2', '2'],
    ]);
  });
});

describe('matchContent', () => {
  it('turns match positions into line numbers for LF and CRLF content', () => {
    const crlf = file('a.ts', 'x();\r\ntry {\r\n  y();\r\n} catch {\r\n}\r\n');
    expect(matchContent(crlf, /catch\s*\{\s*\}/g).map((m) => m.line)).toEqual([4]);
    const lf = file('b.ts', 'a\nb b\nc\nb\n');
    expect(matchContent(lf, /b/g).map((m) => m.line)).toEqual([2, 2, 4]);
  });

  it('returns nothing for files that were not read', () => {
    expect(matchContent(file('big.ts', null), /x/g)).toEqual([]);
  });
});
