/** Parses JSON with comments and trailing commas (tsconfig.json flavour). Throws like JSON.parse. */
export function parseJsonc(text: string): unknown {
  return JSON.parse(stripTrailingCommas(stripComments(text)));
}

/** Drops a comma outside a string when only whitespace separates it from a following '}' or ']'. */
function stripTrailingCommas(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (inString) {
      if (ch === '\\') {
        out += ch + text.charAt(i + 1);
        i++;
        continue;
      }
      if (ch === '"') inString = false;
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text.charAt(j))) j++;
      const next = text.charAt(j);
      if (next === '}' || next === ']') continue;
    }
    out += ch;
  }
  return out;
}

/** Drops line and block comments outside strings, so "http://x" or "./src/*" inside a string survives. */
function stripComments(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (inString) {
      if (ch === '\\') {
        out += ch + text.charAt(i + 1);
        i++;
        continue;
      }
      if (ch === '"') inString = false;
      out += ch;
      continue;
    }
    const next = text.charAt(i + 1);
    if (ch === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      if (end === -1) break;
      // The loop's i++ lands on '\n', which is kept so JSON.parse errors keep their line numbers.
      i = end - 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 1;
      out += ' ';
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}
