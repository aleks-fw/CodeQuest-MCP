import { describe, expect, it } from 'vitest';
import { buildImportGraph, extractJsImports } from '../../src/analyzer/import-graph.js';
import { importCycleRule } from '../../src/analyzer/rules/import-cycle.js';
import { unusedFileRule } from '../../src/analyzer/rules/unused-file.js';
import { collectTestFacts } from '../../src/analyzer/test-facts.js';
import { runRule } from '../helpers/rule-context.js';
import { sourceFiles } from '../helpers/source-files.js';

describe('extractJsImports', () => {
  it('marks import type and export type … from as type-only, everything else as runtime', () => {
    const content = [
      "import type { A } from './a';",
      "import { b } from './b';",
      "export type { C } from './c';",
      "import type { D } from './d';",
      "import { d } from './d';",
      "import { type E, e } from './e';",
      "const lazy = import('./lazy');",
    ].join('\n');
    expect(extractJsImports(content)).toEqual([
      { specifier: './a', typeOnly: true },
      { specifier: './b', typeOnly: false },
      { specifier: './c', typeOnly: true },
      { specifier: './d', typeOnly: false },
      { specifier: './e', typeOnly: false },
      { specifier: './lazy', typeOnly: false },
    ]);
  });
});

describe('type-only edges', () => {
  const files = sourceFiles({
    'src/types.ts': "import type { View } from './view';\nexport interface Model { view: View }\n",
    'src/view.ts': "import { Model } from './types';\nexport type View = Model;\n",
  });

  it('stay in imports but not in runtimeImports', () => {
    const graph = buildImportGraph(files, null);
    expect(graph.imports.get('src/types.ts')).toEqual(['src/view.ts']);
    expect(graph.runtimeImports.get('src/types.ts')).toEqual([]);
    expect(graph.runtimeImports.get('src/view.ts')).toEqual(['src/types.ts']);
  });

  it('do not make an import cycle, and the imported file still counts as used', () => {
    const project = {
      'src/index.ts': "import { Model } from './types';\nexport const m: Model | null = null;\n",
      'src/types.ts': "import type { View } from './view';\nexport interface Model { view: View }\n",
      'src/view.ts': "import { Model } from './types';\nexport type View = Model;\n",
    };
    expect(runRule(importCycleRule, project)).toEqual([]);
    expect(runRule(unusedFileRule, project)).toEqual([]);
  });

  it('a runtime cycle is still reported', () => {
    const hits = runRule(importCycleRule, {
      'src/a.ts': "import { b } from './b';\nexport const a = b;\n",
      'src/b.ts': "import { a } from './a';\nexport const b = a;\n",
    });
    expect(hits).toHaveLength(1);
  });

  it('a test that only imports types does not test the module', () => {
    const project = sourceFiles({
      'src/model.ts': 'export interface Model { id: number }\n',
      'src/model.test.ts':
        "import type { Model } from './model';\nit('x', () => { const m: Model = { id: 1 }; expect(m.id).toBe(1); });\n",
    });
    const facts = collectTestFacts(project, buildImportGraph(project, null));
    expect(facts.testedModules.has('src/model.ts')).toBe(false);
  });
});
