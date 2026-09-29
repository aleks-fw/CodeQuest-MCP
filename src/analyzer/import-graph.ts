import path from 'node:path';
import type { FileKind, Language, SourceFile } from './files.js';
import { extractPythonImports, resolvePythonImport } from './python-imports.js';

/** Languages whose imports are resolved. */
export const GRAPH_LANGUAGES: ReadonlySet<Language> = new Set<Language>(['typescript', 'javascript', 'python']);

export interface ImportGraph {
  /** file → files it imports directly. Every graph file has an entry; lists are sorted and unique. */
  imports: Map<string, string[]>;
  /** Same as imports without the edges that only carry types (import type, if TYPE_CHECKING:): no runtime cycle. */
  runtimeImports: Map<string, string[]>;
  /** file → files that import it directly. Same keys as imports. */
  importedBy: Map<string, string[]>;
}

const GRAPH_KINDS: ReadonlySet<FileKind> = new Set<FileKind>(['code', 'test', 'config']);

// The clause between `import`/`export` and `from` never holds quotes, `;`, `=` or parentheses, and is capped,
// so a file full of `export const x = 1` cannot make the scan quadratic.
// Regexes instead of a parser: fast on 1000 files, and a missed edge only weakens a hint, never crashes.
const FROM_SPECIFIER = /\b(?:import|export)\s([^'";=()]{0,5000}?)\sfrom\s*['"]([^'"]+)['"]/g;
const SIDE_EFFECT_SPECIFIER = /\bimport\s*['"]([^'"]+)['"]/g;
const CALL_SPECIFIER = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const RESOLVE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
// TypeScript ESM code imports './x.js' while the file on disk is x.ts.
const TS_FOR_JS_EXTS = ['.ts', '.tsx', '.mts', '.cts'];

export interface ImportRef {
  specifier: string;
  /** True when every statement naming the specifier is import type / export type … from. */
  typeOnly: boolean;
}

export function extractJsImports(content: string): ImportRef[] {
  const found = new Map<string, boolean>();
  const add = (specifier: string | undefined, typeOnly: boolean): void => {
    if (specifier !== undefined) found.set(specifier, (found.get(specifier) ?? true) && typeOnly);
  };
  for (const match of content.matchAll(FROM_SPECIFIER)) add(match[2], /^type\b/.test(match[1] ?? ''));
  for (const pattern of [SIDE_EFFECT_SPECIFIER, CALL_SPECIFIER]) {
    for (const match of content.matchAll(pattern)) add(match[1], false);
  }
  return [...found.entries()].map(([specifier, typeOnly]) => ({ specifier, typeOnly })).sort(bySpecifier);
}

export function extractJsSpecifiers(content: string): string[] {
  return extractJsImports(content).map((ref) => ref.specifier);
}

function bySpecifier(a: ImportRef, b: ImportRef): number {
  return a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0;
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
  const nodes = new Map<string, SourceFile>();
  for (const file of files) {
    if (GRAPH_LANGUAGES.has(file.language) && GRAPH_KINDS.has(file.kind) && file.content !== null) {
      nodes.set(file.path, file);
    }
  }
  const paths = [...nodes.keys()].sort();
  const known: ReadonlySet<string> = new Set(paths);
  const imports = new Map<string, string[]>();
  const runtimeImports = new Map<string, string[]>();
  const importedBy = new Map<string, string[]>(paths.map((filePath) => [filePath, []]));
  // Walking sources in sorted order keeps every importedBy list sorted without a second pass.
  for (const from of paths) {
    // target → true while every reference to it only carries types.
    const targets = new Map<string, boolean>();
    const source = nodes.get(from);
    const edges =
      source?.language === 'python'
        ? extractPythonImports(source.content ?? '').flatMap((imp) => resolvePythonImport(from, imp, known))
        : extractJsImports(source?.content ?? '').flatMap((ref) => {
            const target = resolveJsSpecifier(from, ref.specifier, known, aliasBase);
            return target === null ? [] : [{ target, typeOnly: ref.typeOnly }];
          });
    for (const edge of edges) targets.set(edge.target, (targets.get(edge.target) ?? true) && edge.typeOnly);
    const sorted = [...targets.keys()].sort();
    imports.set(from, sorted);
    runtimeImports.set(
      from,
      sorted.filter((target) => targets.get(target) === false),
    );
    for (const target of sorted) importedBy.get(target)?.push(from);
  }
  return { imports, runtimeImports, importedBy };
}
