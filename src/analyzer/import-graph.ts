import path from 'node:path';
import type { FileKind, Language, SourceFile } from './files.js';

/** Languages whose imports are resolved; stage 3 adds python. */
export const GRAPH_LANGUAGES: ReadonlySet<Language> = new Set<Language>(['typescript', 'javascript']);

export interface ImportGraph {
  /** file → files it imports directly. Every graph file has an entry; lists are sorted and unique. */
  imports: Map<string, string[]>;
  /** file → files that import it directly. Same keys as imports. */
  importedBy: Map<string, string[]>;
}

const GRAPH_KINDS: ReadonlySet<FileKind> = new Set<FileKind>(['code', 'test', 'config']);

// The clause between `import`/`export` and `from` never holds quotes, `;`, `=` or parentheses, and is capped,
// so a file full of `export const x = 1` cannot make the scan quadratic.
// Regexes instead of a parser: fast on 1000 files, and a missed edge only weakens a hint, never crashes.
const FROM_SPECIFIER = /\b(?:import|export)\s[^'";=()]{0,5000}?\sfrom\s*['"]([^'"]+)['"]/g;
const SIDE_EFFECT_SPECIFIER = /\bimport\s*['"]([^'"]+)['"]/g;
const CALL_SPECIFIER = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const RESOLVE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
// TypeScript ESM code imports './x.js' while the file on disk is x.ts.
const TS_FOR_JS_EXTS = ['.ts', '.tsx', '.mts', '.cts'];

export function extractJsSpecifiers(content: string): string[] {
  const found = new Set<string>();
  for (const pattern of [FROM_SPECIFIER, SIDE_EFFECT_SPECIFIER, CALL_SPECIFIER]) {
    for (const match of content.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) found.add(specifier);
    }
  }
  return [...found].sort();
}

/** Project file the specifier points to; null for packages, unknown aliases and missing files. */
export function resolveJsSpecifier(
  from: string,
  specifier: string,
  files: ReadonlySet<string>,
  aliasBase: string | null,
): string | null {
  let base: string;
  if (specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../')) {
    base = path.posix.join(path.posix.dirname(from), specifier);
  } else if (specifier.startsWith('@/') && aliasBase !== null) {
    base = path.posix.normalize(aliasBase + specifier.slice(2));
  } else {
    return null;
  }
  base = base.replace(/\/+$/, '');
  for (const candidate of candidatesFor(base)) {
    if (files.has(candidate)) return candidate;
  }
  return null;
}

function candidatesFor(base: string): string[] {
  const stem = base.replace(/\.[cm]?js$/, '');
  const fromJs = stem === base ? [] : TS_FOR_JS_EXTS.map((ext) => stem + ext);
  const indexBase = base === '.' ? 'index' : `${base}/index`;
  return [base, ...fromJs, ...RESOLVE_EXTS.map((ext) => base + ext), ...RESOLVE_EXTS.map((ext) => indexBase + ext)];
}

export function buildImportGraph(files: SourceFile[], aliasBase: string | null): ImportGraph {
  const nodes = new Map<string, string>();
  for (const file of files) {
    if (GRAPH_LANGUAGES.has(file.language) && GRAPH_KINDS.has(file.kind) && file.content !== null) {
      nodes.set(file.path, file.content);
    }
  }
  const paths = [...nodes.keys()].sort();
  const known: ReadonlySet<string> = new Set(paths);
  const imports = new Map<string, string[]>();
  const importedBy = new Map<string, string[]>(paths.map((filePath) => [filePath, []]));
  // Walking sources in sorted order keeps every importedBy list sorted without a second pass.
  for (const from of paths) {
    const targets = new Set<string>();
    for (const specifier of extractJsSpecifiers(nodes.get(from) ?? '')) {
      const target = resolveJsSpecifier(from, specifier, known, aliasBase);
      if (target !== null) targets.add(target);
    }
    const sorted = [...targets].sort();
    imports.set(from, sorted);
    for (const target of sorted) importedBy.get(target)?.push(from);
  }
  return { imports, importedBy };
}
