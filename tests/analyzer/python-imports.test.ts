import { describe, expect, it } from 'vitest';
import { buildImportGraph } from '../../src/analyzer/import-graph.js';
import { extractPythonImports, resolvePythonImport } from '../../src/analyzer/python-imports.js';
import { importCycleRule } from '../../src/analyzer/rules/import-cycle.js';
import { untestedModuleRule } from '../../src/analyzer/rules/untested-module.js';
import { unusedFileRule } from '../../src/analyzer/rules/unused-file.js';
import { runRule } from '../helpers/rule-context.js';
import { sourceFiles } from '../helpers/source-files.js';

describe('extractPythonImports', () => {
  it('reads plain, aliased, from, relative, multi-line and star imports', () => {
    const content = [
      'import os, sys as system',
      'import pkg.sub.mod',
      'from pkg import a, b as c',
      'from . import sibling',
      'from ..up import thing  # comment',
      'from lib import (',
      '    one,',
      '    two as deux,',
      ')',
      'from star import *',
      'x = "import fake"',
    ].join('\n');
    expect(extractPythonImports(content)).toEqual([
      { module: 'os', level: 0, names: [], typeOnly: false },
      { module: 'sys', level: 0, names: [], typeOnly: false },
      { module: 'pkg.sub.mod', level: 0, names: [], typeOnly: false },
      { module: 'pkg', level: 0, names: ['a', 'b'], typeOnly: false },
      { module: '', level: 1, names: ['sibling'], typeOnly: false },
      { module: 'up', level: 2, names: ['thing'], typeOnly: false },
      { module: 'lib', level: 0, names: ['one', 'two'], typeOnly: false },
      { module: 'star', level: 0, names: [], typeOnly: false },
    ]);
  });

  it('marks imports inside if TYPE_CHECKING as type-only and ends the block on dedent', () => {
    const content = [
      'from typing import TYPE_CHECKING',
      'if TYPE_CHECKING:',
      '    from app.models import User',
      '    import app.types',
      'import app.runtime',
    ].join('\n');
    expect(extractPythonImports(content).map((imp) => [imp.module, imp.typeOnly])).toEqual([
      ['typing', false],
      ['app.models', true],
      ['app.types', true],
      ['app.runtime', false],
    ]);
  });

  it('stays fast on a 1 MB file without imports', () => {
    const content = 'value = compute(1, 2)\n'.repeat(50_000);
    const started = performance.now();
    expect(extractPythonImports(content)).toEqual([]);
    expect(performance.now() - started, 'extract time').toBeLessThan(1000);
  });
});

describe('resolvePythonImport', () => {
  const known = new Set([
    'main.py',
    'app/__init__.py',
    'app/models.py',
    'app/handlers/__init__.py',
    'app/handlers/start.py',
    'src/util/text.py',
    'tools/run.py',
    'tools/helper.py',
  ]);
  const edge = (from: string, module: string, names: string[] = [], level = 0) =>
    resolvePythonImport(from, { module, level, names, typeOnly: false }, known).map((item) => item.target);

  it('resolves modules, packages, src/ layout and the importer folder', () => {
    expect(edge('main.py', 'app.models')).toEqual(['app/models.py']);
    expect(edge('main.py', 'app')).toEqual(['app/__init__.py']);
    expect(edge('main.py', 'util.text')).toEqual(['src/util/text.py']);
    expect(edge('tools/run.py', 'helper')).toEqual(['tools/helper.py']);
  });

  it('import a.b.c points at the deepest project module', () => {
    expect(edge('main.py', 'app.models.Extra')).toEqual(['app/models.py']);
  });

  it('from pkg import mod points at the submodule, from pkg import name at the package', () => {
    expect(edge('main.py', 'app.handlers', ['start'])).toEqual(['app/handlers/start.py']);
    expect(edge('main.py', 'app.handlers', ['router'])).toEqual(['app/handlers/__init__.py']);
  });

  it('resolves relative imports and ignores packages that are not ours', () => {
    expect(edge('app/handlers/start.py', '', ['start'], 1)).toEqual(['app/handlers/start.py']);
    expect(edge('app/handlers/start.py', 'models', [], 2)).toEqual(['app/models.py']);
    expect(edge('app/handlers/start.py', '', ['models'], 2)).toEqual(['app/models.py']);
    expect(edge('main.py', 'aiogram')).toEqual([]);
    expect(edge('main.py', 'x', [], 4)).toEqual([]);
  });
});

describe('python import graph and rules', () => {
  const project = {
    'main.py': 'from app.service import run\nrun()\n',
    'app/__init__.py': '',
    'app/service.py': 'from app import helpers\n\n\ndef run():\n    return helpers.go()\n',
    'app/helpers.py': 'def go():\n    total = 0\n    for step in range(3):\n        total += step\n    return total\n',
    'app/old.py': 'VALUE = 1\n',
    'tests/test_service.py': 'from app.service import run\n\n\ndef test_run():\n    assert run() is None\n',
  };

  it('builds edges, importedBy and counts tests as importers', () => {
    const graph = buildImportGraph(sourceFiles(project), null);
    expect(graph.imports.get('main.py')).toEqual(['app/service.py']);
    expect(graph.imports.get('app/service.py')).toEqual(['app/helpers.py']);
    expect(graph.importedBy.get('app/service.py')).toEqual(['main.py', 'tests/test_service.py']);
  });

  it('unused-file flags only the module nobody imports', () => {
    expect(runRule(unusedFileRule, project).map((hit) => hit.file)).toEqual(['app/old.py']);
  });

  it('untested-module flags used modules without a test import', () => {
    expect(runRule(untestedModuleRule, project).map((hit) => hit.file)).toEqual(['app/helpers.py']);
  });

  it('import-cycle finds a runtime cycle but not one through TYPE_CHECKING', () => {
    const cyclic = {
      'a.py': 'import b\n\n\ndef fa():\n    return b.fb\n',
      'b.py': 'import a\n\n\ndef fb():\n    return a.fa\n',
    };
    expect(runRule(importCycleRule, cyclic)).toHaveLength(1);
    const guarded = {
      'a.py': 'from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    import b\n\n\ndef fa():\n    return 1\n',
      'b.py': 'import a\n\n\ndef fb():\n    return a.fa\n',
    };
    expect(runRule(importCycleRule, guarded)).toEqual([]);
  });
});
