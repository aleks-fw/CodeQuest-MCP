import path from 'node:path';

export interface PyImport {
  /** Dotted module without leading dots; '' for `from . import x`. */
  module: string;
  /** Leading dots of a relative import; 0 for an absolute one. */
  level: number;
  /** Names after `from … import`; empty for a plain `import a.b`. */
  names: string[];
  /** Inside `if TYPE_CHECKING:` — the import only exists for type checkers. */
  typeOnly: boolean;
}

export interface PyEdge {
  target: string;
  typeOnly: boolean;
}

const IMPORT_LINE = /^(\s*)import\s+(.+)$/;
const FROM_LINE = /^(\s*)from\s+(\.*)([\w.]*)\s+import\s*(.*)$/;
const TYPE_CHECKING_BLOCK = /^(\s*)if\s+(?:typing\.)?TYPE_CHECKING\s*:/;

/** Line-based scan: fast on big files and a missed import only weakens a hint. Docstring examples can add a false edge. */
export function extractPythonImports(content: string): PyImport[] {
  const lines = content.split(/\r?\n/);
  const found: PyImport[] = [];
  let typeIndent = -1;
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index] ?? '';
    const code = stripComment(raw);
    if (code.trim() === '') continue;
    const indent = code.length - code.trimStart().length;
    if (typeIndent >= 0 && indent <= typeIndent) typeIndent = -1;
    if (TYPE_CHECKING_BLOCK.test(code)) {
      typeIndent = indent;
      continue;
    }
    const typeOnly = typeIndent >= 0;
    const plain = IMPORT_LINE.exec(code);
    if (plain) {
      for (const item of (plain[2] ?? '').split(',')) {
        const module = (item.split(/\s+as\s+/)[0] ?? '').trim();
        if (/^[\w.]+$/.test(module)) found.push({ module, level: 0, names: [], typeOnly });
      }
      continue;
    }
    const from = FROM_LINE.exec(code);
    if (!from) continue;
    let names = from[4] ?? '';
    if (names.trimStart().startsWith('(') && !names.includes(')')) {
      // Parenthesised list continues on the next lines until the closing bracket.
      while (index + 1 < lines.length && !names.includes(')')) {
        index++;
        names += ` ${stripComment(lines[index] ?? '')}`;
      }
    }
    const list = names
      .replace(/[()]/g, ' ')
      .split(',')
      .map((item) => (item.trim().split(/\s+as\s+/)[0] ?? '').trim())
      .filter((name) => /^\w+$/.test(name));
    found.push({ module: from[3] ?? '', level: (from[2] ?? '').length, names: list, typeOnly });
  }
  return found;
}

/** Project files an import points to; external packages and the standard library resolve to nothing. */
export function resolvePythonImport(from: string, imp: PyImport, known: ReadonlySet<string>): PyEdge[] {
  const modulePath = imp.module === '' ? '' : imp.module.replaceAll('.', '/');
  const bases = imp.level > 0 ? [relativeBase(from, imp.level)] : searchRoots(from);
  for (const base of bases) {
    if (base === null) continue;
    const found = resolveUnder(base, modulePath, imp, known);
    if (found.length > 0) return found.map((target) => ({ target, typeOnly: imp.typeOnly }));
  }
  return [];
}

function resolveUnder(base: string, modulePath: string, imp: PyImport, known: ReadonlySet<string>): string[] {
  const dir = joinPath(base, modulePath);
  const targets = new Set<string>();
  if (imp.names.length === 0) {
    // `import a.b.c` runs a, a.b and a.b.c; the deepest one that is ours is the meaningful edge.
    const parts = modulePath.split('/').filter((part) => part !== '');
    for (let length = parts.length; length > 0 && targets.size === 0; length--) {
      const target = moduleFile(joinPath(base, parts.slice(0, length).join('/')), known);
      if (target !== null) targets.add(target);
    }
    return [...targets];
  }
  // `from pkg import mod` names a submodule; `from pkg import func` reads the package itself.
  let sawNonModule = false;
  for (const name of imp.names) {
    const submodule = moduleFile(joinPath(dir, name), known);
    if (submodule !== null) targets.add(submodule);
    else sawNonModule = true;
  }
  if (sawNonModule) {
    const target = moduleFile(dir, known);
    if (target !== null) targets.add(target);
  }
  return [...targets];
}

function moduleFile(base: string, known: ReadonlySet<string>): string | null {
  if (base === '') return known.has('__init__.py') ? '__init__.py' : null;
  for (const candidate of [`${base}.py`, `${base}/__init__.py`]) {
    if (known.has(candidate)) return candidate;
  }
  return null;
}

/** Project root, `src/`, then the importing file's own folder (scripts see their own directory first). */
function searchRoots(from: string): string[] {
  const dir = path.posix.dirname(from);
  return dir === '.' ? ['', 'src'] : ['', 'src', dir];
}

function relativeBase(from: string, level: number): string | null {
  let dir = path.posix.dirname(from);
  if (dir === '.') dir = '';
  for (let up = 1; up < level; up++) {
    if (dir === '') return null;
    dir = path.posix.dirname(dir);
    if (dir === '.') dir = '';
  }
  return dir;
}

function joinPath(base: string, rest: string): string {
  if (base === '') return rest;
  return rest === '' ? base : `${base}/${rest}`;
}

function stripComment(line: string): string {
  const hash = line.indexOf('#');
  return hash < 0 ? line : line.slice(0, hash);
}
