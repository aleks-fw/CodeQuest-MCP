import type { Facts } from '../types.js';
import { isModule } from './context.js';
import { isCodePath, type Language, type SourceFile } from './files.js';
import type { JsProject } from './js-project.js';
import type { PythonProject } from './python-project.js';
import type { TestFacts } from './test-facts.js';

export interface FactsInput {
  files: SourceFile[];
  js: JsProject;
  python: PythonProject;
  tests: TestFacts;
  measure: { codeLines: number; fileLines: Record<string, number> };
  botHandlers: number;
  hotspots: string[];
  domains?: Facts['domains'];
}

// Alphabetical, so `languages` keys come out sorted.
const FACT_LANGUAGES: readonly Language[] = ['css', 'html', 'javascript', 'python', 'typescript'];

export function buildFacts(input: FactsInput): Facts {
  const { files, js, python, tests } = input;
  const languages: Record<string, number> = {};
  for (const language of FACT_LANGUAGES) {
    const count = files.filter((file) => file.language === language).length;
    if (count > 0) languages[language] = count;
  }
  const stacks: Facts['stacks'] = [];
  if (js.hasPackageJson || (languages.typescript ?? 0) + (languages.javascript ?? 0) > 0) stacks.push('js');
  if (files.some((file) => file.language === 'python')) stacks.push('python');
  const modules = files.filter(isModule);
  const commands = { ...python.commands, ...js.commands };
  const scripts: Facts['scripts'] = {};
  for (const name of ['test', 'lint', 'build'] as const) {
    const command = commands[name];
    if (command !== undefined)
      scripts[name] = js.commands[name] === undefined ? command : (js.scripts[name] ?? command);
  }
  const facts: Facts = {
    languages,
    stacks,
    frameworks: [...new Set([...js.frameworks, ...python.frameworks])].sort(),
    domains: input.domains ?? [],
    // A project with both stacks keeps the JS commands; Python fills the ones JS does not have.
    commands,
    scripts,
    sourceFiles: files.filter((file) => isCodePath(file.path)).length,
    modules: modules.length,
    modulesWithTests: modules.filter((file) => tests.testedModules.has(file.path)).length,
    testCasesTotal: tests.testCasesTotal,
    testCasesByModule: sortedRecord(tests.testCasesByModule),
    codeLines: input.measure.codeLines,
    fileLines: sortedRecord(input.measure.fileLines),
    botHandlers: input.botHandlers,
    hotspots: [...input.hotspots],
  };
  if (tests.coverage !== undefined) facts.coverage = tests.coverage;
  return facts;
}

/** Same record with keys in code-point order, so the snapshot JSON does not depend on build order. */
function sortedRecord(record: Record<string, number>): Record<string, number> {
  const sorted: Record<string, number> = {};
  for (const key of Object.keys(record).sort()) sorted[key] = record[key] ?? 0;
  return sorted;
}
