import type { Finding, Snapshot } from '../types.js';
import type { AnalysisContext } from './context.js';
import { findEntryPoints } from './entry-points.js';
import { buildFacts } from './facts.js';
import { listFiles, loadFiles, type SourceFile } from './files.js';
import { toFindings } from './findings.js';
import { computeChangeKey, readHead, readHotspots } from './history.js';
import { buildImportGraph, GRAPH_LANGUAGES } from './import-graph.js';
import { readJsProject } from './js-project.js';
import { countBotHandlers, measureLines } from './metrics.js';
import { RULES } from './rules/index.js';
import type { Rule } from './rules/types.js';
import { collectTestFacts, readCoverage } from './test-facts.js';

export interface AnalyzeOptions {
  now: Date;
  /** Defaults to RULES; tests pass a single rule. */
  rules?: readonly Rule[];
}

export interface ContextInput {
  root: string;
  files: SourceFile[];
  isGitRepo: boolean;
  tracked: Set<string>;
  /** Already filtered to listed files. */
  hotspots?: string[];
  coverage?: number;
}

export async function analyzeProject(root: string, options: AnalyzeOptions): Promise<Snapshot> {
  const listing = await listFiles(root);
  const head = listing.isGitRepo ? await readHead(root) : null;
  const changeKey = computeChangeKey(head, listing.files);
  const files = await loadFiles(root, listing.files);
  const coverage = await readCoverage(root);
  const listed = new Set(listing.files.map((file) => file.path));
  // History can name deleted or ignored files; only files that exist now are hot.
  const hotspots = listing.isGitRepo ? (await readHotspots(root)).filter((file) => listed.has(file)) : [];
  const ctx = buildContext({ root, files, isGitRepo: listing.isGitRepo, tracked: listing.tracked, hotspots, coverage });

  const findings: Finding[] = [];
  const errors: Snapshot['errors'] = [];
  for (const rule of options.rules ?? RULES) {
    try {
      findings.push(...toFindings(rule, rule.run(ctx)));
    } catch (error) {
      // One broken rule must not cost the whole snapshot (spec §3.6).
      errors.push({ rule: rule.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  findings.sort(compareFindings);
  return { schema: 1, takenAt: options.now.toISOString(), changeKey, head, facts: ctx.facts, findings, errors };
}

/** Pure part of the analysis: no disk, no git. Unit tests of rules call it with in-memory files. */
export function buildContext(input: ContextInput): AnalysisContext {
  const { files } = input;
  const byPath = new Map(files.map((file) => [file.path, file]));
  const js = readJsProject(byPath);
  const graph = buildImportGraph(files, js.aliasBase);
  const entryPoints = findEntryPoints(files, js);
  const tests = collectTestFacts(files, graph);
  if (input.coverage !== undefined) tests.coverage = input.coverage;
  const facts = buildFacts({
    files,
    js,
    tests,
    measure: measureLines(files),
    botHandlers: countBotHandlers(files),
    hotspots: input.hotspots ?? [],
  });
  return {
    root: input.root,
    files,
    byPath,
    isGitRepo: input.isGitRepo,
    tracked: input.tracked,
    js,
    graph,
    graphLanguages: GRAPH_LANGUAGES,
    entryPoints,
    tests,
    facts,
  };
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** File ('' first), line (0 when absent), rule, id — code-point order, independent of locale. */
function compareFindings(a: Finding, b: Finding): number {
  return (
    compareText(a.file ?? '', b.file ?? '') ||
    (a.line ?? 0) - (b.line ?? 0) ||
    compareText(a.rule, b.rule) ||
    compareText(a.id, b.id)
  );
}
