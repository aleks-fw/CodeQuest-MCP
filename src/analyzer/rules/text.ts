import type { Language, SourceFile } from '../files.js';

/** Languages the js/* rules look at. */
export const JS_LANGUAGES: ReadonlySet<Language> = new Set(['typescript', 'javascript']);

const COMMENT_STARTS = ['//', '/*', '*', '#', '<!--'];

export function isCommentLine(text: string): boolean {
  const trimmed = text.trimStart();
  return COMMENT_STARTS.some((start) => trimmed.startsWith(start));
}

export interface LineMatch {
  /** 1-based. */
  line: number;
  text: string;
  match: RegExpExecArray;
}

export interface ContentMatch {
  /** 1-based line where the match starts. */
  line: number;
  match: RegExpExecArray;
}

/** Tests each line on its own. A non-global copy keeps lastIndex from leaking between lines. */
export function matchLines(file: SourceFile, pattern: RegExp): LineMatch[] {
  const single = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
  const found: LineMatch[] = [];
  for (const [index, text] of file.lines.entries()) {
    const match = single.exec(text);
    if (match) found.push({ line: index + 1, text, match });
  }
  return found;
}

/** For patterns that span lines: scans the whole content and turns match.index into a line number. */
export function matchContent(file: SourceFile, pattern: RegExp): ContentMatch[] {
  const content = file.content;
  if (content === null) return [];
  const flags = pattern.flags.replace('y', '');
  const global = new RegExp(pattern.source, flags.includes('g') ? flags : `${flags}g`);
  const found: ContentMatch[] = [];
  let line = 1;
  let scanned = 0;
  for (let match = global.exec(content); match !== null; match = global.exec(content)) {
    // Counting '\n' works for CRLF too: each \r\n holds exactly one \n.
    for (let index = scanned; index < match.index; index++) {
      if (content.charCodeAt(index) === 10) line++;
    }
    scanned = match.index;
    found.push({ line, match });
    if (match[0].length === 0) global.lastIndex++;
  }
  return found;
}
