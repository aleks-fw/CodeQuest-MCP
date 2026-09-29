import type { Finding, Snapshot } from '../types.js';
import type { AnalysisContext } from './context.js';
import { detectDomains } from './domains.js';
import { findEntryPoints } from './entry-points.js';
import { buildFacts } from './facts.js';
import { listFiles, loadFiles, type SourceFile } from './files.js';
import { toFindings } from './findings.js';
import { computeChangeKey, readHead, readHotspots } from './history.js';
import { buildImportGraph, GRAPH_LANGUAGES } from './import-graph.js';
import { readJsProject } from './js-project.js';
import { countBotHandlers, measureLines } from './metrics.js';
import { findVenvPython, readPythonProject } from './python-project.js';
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
  /** Project virtualenv python (relative, no extension) when one exists; found on disk by analyzeProject. */
  venvPython?: string | null;
}

export async function analyzeProject(root: string, options: AnalyzeOptions): Promise<Snapshot> {
  return (await analyzeWithContext(root, options)).snapshot;
}

/** Same as analyzeProject and keeps the context: quest verification reads files and the import graph from it. */
export async function analyzeWithContext(
  root: string,
  options: AnalyzeOptions,
): Promise<{ snapshot: Snapshot; ctx: AnalysisContext }> {
  const listing = await listFiles(root);
  const head = listing.isGitRepo ? await readHead(root) : null;
  const changeKey = computeChangeKey(head, listing.files);
  const files = await loadFiles(root, listing.files);
  const coverage = await readCoverage(root);
  const listed = new Set(listing.files.map((file) => file.path));
  // History can name deleted or ignored files; only files that exist now are hot.
  const hotspots = listing.isGitRepo ? (await readHotspots(root)).filter((file) => listed.has(file)) : [];
  const venvPython = await findVenvPython(root);
  const ctx = buildContext({
    root,
    files,
    isGitRepo: listing.isGitRepo,
    tracked: listing.tracked,
    hotspots,
    coverage,
    venvPython,
  });

  const findings: Finding[] = [];
  const errors: Snapshot['errors'] = [];
  const packs = new Set(ctx.facts.domains.map((domain) => domain.pack));
  for (const rule of options.rules ?? RULES) {
    if (rule.pack !== undefined && !packs.has(rule.pack)) continue;
    try {
      findings.push(...toFindings(rule, rule.run(ctx)));
    } catch (error) {
      // One broken rule must not cost the whole snapshot (spec §3.6).
      errors.push({ rule: rule.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  findings.sort(compareFindings);
  const snapshot: Snapshot = {
    schema: 1,
    takenAt: options.now.toISOString(),
    changeKey,
    head,
    facts: ctx.facts,
    findings,
    errors,
  };
  return { snapshot, ctx };
}

/** Pure part of the analysis: no disk, no git. Unit tests of rules call it with in-memory files. */
export function buildContext(input: ContextInput): AnalysisContext {
  const { files } = input;
  const byPath = new Map(files.map((file) => [file.path, file]));
  const js = readJsProject(byPath);
  const python = readPythonProject(byPath, input.venvPython ?? null);
  const graph = buildImportGraph(files, js.aliasBase);
  const entryPoints = findEntryPoints(files, js);
  const tests = collectTestFacts(files, graph);
  if (input.coverage !== undefined) tests.coverage = input.coverage;
  const botHandlers = countBotHandlers(files);
  const domains = detectDomains({
    files,
    dependencies: [...js.dependencies, ...python.dependencies],
    botHandlers,
  });
  const facts = buildFacts({
    files,
    js,
    python,
    tests,
    measure: measureLines(files),
    botHandlers,
    hotspots: input.hotspots ?? [],
    domains,
  });
  return {
    root: input.root,
    files,
    byPath,
    isGitRepo: input.isGitRepo,
    tracked: input.tracked,
    js,
    python,
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
