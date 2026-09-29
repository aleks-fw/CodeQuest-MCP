import type { Facts } from '../types.js';
import type { Language, SourceFile } from './files.js';
import type { ImportGraph } from './import-graph.js';
import type { JsProject } from './js-project.js';
import type { TestFacts } from './test-facts.js';

/** Everything a rule may look at. Built once per analysis; rules only read it. */
export interface AnalysisContext {
  root: string;
  files: SourceFile[];
  byPath: Map<string, SourceFile>;
  isGitRepo: boolean;
  /** Paths in the git index; empty outside git. */
  tracked: Set<string>;
  js: JsProject;
  graph: ImportGraph;
  /** Languages the import graph understands; graph rules skip other files. */
  graphLanguages: ReadonlySet<Language>;
  entryPoints: Set<string>;
  tests: TestFacts;
  facts: Facts;
}

/** A module is a code file that is not a test, a config or a type declaration. */
export function isModule(file: SourceFile): boolean {
  return file.kind === 'code' && !file.path.endsWith('.d.ts');
}
