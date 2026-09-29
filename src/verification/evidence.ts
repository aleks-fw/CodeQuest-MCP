import type { AnalysisContext } from '../analyzer/context.js';
import type { CommandRun, Snapshot } from '../types.js';

export type CommandName = 'test' | 'lint' | 'build';

/** Everything a condition may look at: a fresh analysis, what changed since the quest appeared, command runs. */
export interface Evidence {
  ctx: AnalysisContext;
  snapshot: Pick<Snapshot, 'findings' | 'facts' | 'changeKey'>;
  /** Files changed since the quest's "as it was" (spec §8.1); null when unknown — then every file counts as changed. */
  changed: ReadonlySet<string> | null;
  /** Latest run per command; a run counts only when its changeKey is the current one. */
  runs: Partial<Record<CommandName, CommandRun>>;
}

/** The run of a command for the project as it is now, if there is one. */
export function currentRun(evidence: Evidence, name: CommandName): CommandRun | undefined {
  const run = evidence.runs[name];
  return run !== undefined && run.changeKey === evidence.snapshot.changeKey ? run : undefined;
}

/** Test files that import the module at run time, with their case and assertion counts (spec §8.1 tests_cover). */
export function testsFor(ctx: AnalysisContext, module: string): { files: string[]; cases: number; assertions: number } {
  const files = ctx.tests.testFiles.filter((file) => ctx.graph.runtimeImports.get(file)?.includes(module));
  let cases = 0;
  let assertions = 0;
  for (const file of files) {
    cases += ctx.tests.casesByFile[file] ?? 0;
    assertions += ctx.tests.assertionsByFile[file] ?? 0;
  }
  return { files, cases, assertions };
}

/** A file is used when something imports it or it is an entry point; files outside the graph count as used. */
export function isUsed(ctx: AnalysisContext, file: string): boolean {
  const source = ctx.byPath.get(file);
  if (source === undefined) return false;
  if (!ctx.graphLanguages.has(source.language)) return true;
  return ctx.entryPoints.has(file) || (ctx.graph.importedBy.get(file)?.length ?? 0) > 0;
}
