import path from 'node:path';
import { isCodePath, type SourceFile } from './files.js';
import type { JsProject } from './js-project.js';

const NEXT_ENTRY_PATTERNS: readonly RegExp[] = [
  /^(src\/)?app\/(.*\/)?(page|layout|route|loading|error|not-found|template|default)\.[cm]?[jt]sx?$/,
  /^(src\/)?pages\//,
  /^(src\/)?middleware\.[cm]?[jt]s$/,
];
const ROOT_ENTRY = /^(src\/)?(index|server|bot)\.(py|[cm]?[jt]sx?)$/;
const PY_MAIN_GUARD = /if\s+__name__\s*==\s*['"]__main__['"]/;
const PY_ENTRY_NAMES: ReadonlySet<string> = new Set(['main.py', 'bot.py', 'app.py', 'manage.py', '__init__.py']);
// \s before src so data-src="…" does not count.
const SCRIPT_SRC = /<script\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/gi;
const EXTERNAL_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** Files that run without being imported (spec §3.2): unused-file and untested-module skip them. */
export function findEntryPoints(files: SourceFile[], js: JsProject): Set<string> {
  const paths = new Set(files.map((file) => file.path));
  const found = new Set<string>();
  const addExisting = (candidate: string): void => {
    if (paths.has(candidate)) found.add(candidate);
  };
  for (const ref of js.entryRefs) addExisting(ref);
  for (const script of Object.values(js.scripts)) {
    for (const token of scriptTokens(script)) addExisting(token);
  }
  for (const file of files) {
    if (file.language === 'html') {
      for (const source of scriptSources(file)) addExisting(source);
    } else if (isCodePath(file.path) && isEntryFile(file)) {
      found.add(file.path);
    }
  }
  return new Set([...found].sort());
}

function isEntryFile(file: SourceFile): boolean {
  if (file.kind === 'config' || ROOT_ENTRY.test(file.path)) return true;
  if (NEXT_ENTRY_PATTERNS.some((pattern) => pattern.test(file.path))) return true;
  if (file.language !== 'python') return false;
  return PY_ENTRY_NAMES.has(path.posix.basename(file.path)) || PY_MAIN_GUARD.test(file.content ?? '');
}

function scriptTokens(script: string): string[] {
  return script
    .split(/\s+/)
    .map((token) => token.replace(/^['"]+|['"]+$/g, '').replace(/^(?:\.\/)+/, ''))
    .filter((token) => token.length > 0);
}

function scriptSources(file: SourceFile): string[] {
  const dir = path.posix.dirname(file.path);
  const sources: string[] = [];
  for (const match of (file.content ?? '').matchAll(SCRIPT_SRC)) {
    const source = (match[1] ?? '').split(/[?#]/)[0] ?? '';
    if (source === '' || EXTERNAL_URL.test(source)) continue;
    // "/main.js" is served from the site root; the project root is the closest guess.
    sources.push(source.startsWith('/') ? path.posix.normalize(source.slice(1)) : path.posix.join(dir, source));
  }
  return sources;
}
