import { describe, expect, it } from 'vitest';
import { toSourceFile } from '../../src/analyzer/files.js';
import {
  buildImportGraph,
  extractJsSpecifiers,
  GRAPH_LANGUAGES,
  resolveJsSpecifier,
} from '../../src/analyzer/import-graph.js';
import { sourceFiles } from '../helpers/source-files.js';

describe('extractJsSpecifiers', () => {
  it('finds static, multi-line, type, re-export, side-effect, dynamic and require specifiers', () => {
    const content = [
      "import a from './a';",
      'import { b,',
      "  c } from '../b.js';",
      "import type { T } from '@/types';",
      "export * from './re';",
      'export { x } from "./x";',
      "import './side.css';",
      "const lazy = await import('./lazy');",
      "const fs = require('node:fs');",
      "const text = 'no import here';",
    ].join('\n');
    expect(extractJsSpecifiers(content)).toEqual([
      '../b.js',
      './a',
      './lazy',
      './re',
      './side.css',
      './x',
      '@/types',
      'node:fs',
    ]);
  });

  it('keeps a long multi-line import list', () => {
    const names = Array.from({ length: 200 }, (_, i) => `  name${i},`).join('\n');
    expect(extractJsSpecifiers(`import {\n${names}\n} from './many';\n`)).toEqual(['./many']);
  });

  it.each([
    ['with semicolons', 'export const X = 1;\n'],
    ['without semicolons', 'export const X = 1\n'],
  ])('stays fast on a 1 MB file of exports %s', (_name, line) => {
    const content = line.repeat(Math.ceil(1_000_000 / line.length));
    const started = performance.now();
    const specifiers = extractJsSpecifiers(content);
    const elapsed = performance.now() - started;
    expect(specifiers).toEqual([]);
    expect(elapsed, `extractJsSpecifiers took ${elapsed} ms`).toBeLessThan(1000);
  });
});

describe('resolveJsSpecifier', () => {
  const FILES: ReadonlySet<string> = new Set([
    'src/a.ts',
    'src/b.tsx',
    'src/c.ts',
    'src/util/index.ts',
    'src/lib/math.js',
    'lib/cart.ts',
  ]);

  it.each([
    ['src/main.ts', './a', 'src/a.ts'],
    ['src/main.ts', './a.js', 'src/a.ts'],
    ['src/main.ts', './b', 'src/b.tsx'],
    ['src/main.ts', './util', 'src/util/index.ts'],
    ['src/main.ts', './lib/math.js', 'src/lib/math.js'],
    ['src/util/index.ts', '../c', 'src/c.ts'],
    ['src/main.ts', '@/c', 'src/c.ts'],
    ['src/main.ts', 'react', null],
    ['src/main.ts', './missing', null],
    ['src/main.ts', '../../outside', null],
  ] as const)('%s imports %s → %s', (from, specifier, expected) => {
    expect(resolveJsSpecifier(from, specifier, FILES, 'src/')).toBe(expected);
  });

  it('resolves @/ only with an alias base', () => {
    expect(resolveJsSpecifier('src/main.ts', '@/c', FILES, null)).toBeNull();
    expect(resolveJsSpecifier('app/page.tsx', '@/lib/cart', FILES, '')).toBe('lib/cart.ts');
  });
});

describe('buildImportGraph', () => {
  it('links project files both ways and ignores packages and non-graph files', () => {
    const files = sourceFiles({
      'src/a.ts': "import { b } from './b';\nimport { c } from './c.js';\nimport React from 'react';\n",
      'src/b.ts': "export { c } from './c';\n",
      'src/c.ts': 'export const c = 1;\n',
      'src/a.test.ts': "import { a } from './a';\n",
      'vitest.config.ts': "import { defineConfig } from 'vitest/config';\n",
      'scripts/tool.py': 'import os\n',
      'README.md': "import x from './src/a';\n",
    });
    const graph = buildImportGraph(files, null);
    const nodes = ['src/a.test.ts', 'src/a.ts', 'src/b.ts', 'src/c.ts', 'vitest.config.ts'];
    expect([...graph.imports.keys()]).toEqual(nodes);
    expect([...graph.importedBy.keys()]).toEqual([...graph.imports.keys()]);
    expect(graph.imports.get('src/a.ts')).toEqual(['src/b.ts', 'src/c.ts']);
    expect(graph.imports.get('src/c.ts')).toEqual([]);
    expect(graph.importedBy.get('src/c.ts')).toEqual(['src/a.ts', 'src/b.ts']);
    expect(graph.importedBy.get('src/a.ts')).toEqual(['src/a.test.ts']);
    expect(graph.importedBy.get('vitest.config.ts')).toEqual([]);
  });

  it('skips unread files and languages outside GRAPH_LANGUAGES', () => {
    const files = [
      ...sourceFiles({ 'src/a.ts': "import './big';\n" }),
      toSourceFile({ path: 'src/big.ts', size: 2_000_000, mtimeMs: 0 }, null),
    ];
    const graph = buildImportGraph(files, null);
    expect(graph.imports.has('src/big.ts')).toBe(false);
    expect(graph.imports.get('src/a.ts')).toEqual([]);
    expect([...GRAPH_LANGUAGES]).toEqual(['typescript', 'javascript']);
  });
});
