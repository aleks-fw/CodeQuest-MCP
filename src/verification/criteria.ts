import type { Criterion, CriterionResult, Quest } from '../types.js';
import { type CommandName, currentRun, type Evidence, isUsed, testsFor } from './evidence.js';

export const MIN_CASES = 3;
export const MIN_ASSERTIONS = 3;
/** A split file must keep at most this share of its old lines, and the project must not lose the moved ones. */
const SPLIT_LOSS_TOLERANCE = 0.25;

const stripIndex = (key: string): string => key.replace(/#\d+$/, '');

function result(criterion: Criterion, ok: boolean, detail: string, missing = false): CriterionResult {
  return missing ? { type: criterion.type, ok, detail, missing } : { type: criterion.type, ok, detail };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** One condition against the evidence (spec §8.1). Never throws: a bad pattern is a failed condition. */
export function evaluateCriterion(quest: Quest, criterion: Criterion, evidence: Evidence): CriterionResult {
  switch (criterion.type) {
    case 'finding_resolved':
      return findingResolved(quest, criterion, evidence);
    case 'target_exists':
      return targetExists(quest, criterion, evidence);
    case 'tests_cover':
      return testsCover(criterion, evidence);
    case 'pattern_present':
      return patternPresent(criterion, evidence);
    case 'pattern_absent':
      return patternAbsent(criterion, evidence);
    case 'command_passes':
      return commandPasses(criterion, evidence);
    case 'no_regressions':
      return noRegressions(quest, criterion, evidence);
  }
}

function findingResolved(quest: Quest, criterion: Criterion, evidence: Evidence): CriterionResult {
  const left = evidence.snapshot.findings.filter((finding) => quest.findings.includes(finding.id));
  if (left.length > 0) return result(criterion, false, `${left.length} of ${quest.findings.length} findings remain`);
  const minCases = criterion.params.minCases;
  if (typeof minCases === 'number' && evidence.snapshot.facts.testCasesTotal < minCases) {
    return result(criterion, false, `${evidence.snapshot.facts.testCasesTotal} test cases, need ${minCases}`);
  }
  return result(criterion, true, 'No findings left');
}

function targetExists(quest: Quest, criterion: Criterion, evidence: Evidence): CriterionResult {
  const { ctx } = evidence;
  const files = stringList(criterion.params.files);
  const missing = files.filter((file) => !ctx.byPath.has(file));
  if (missing.length > 0) return result(criterion, false, `Missing: ${missing.join(', ')}`, true);
  const unused = files.filter((file) => !isUsed(ctx, file));
  if (unused.length > 0) return result(criterion, false, `Not used by anything: ${unused.join(', ')}`);

  const minHandlers = criterion.params.minBotHandlers;
  if (typeof minHandlers === 'number' && evidence.snapshot.facts.botHandlers < minHandlers) {
    return result(criterion, false, `${evidence.snapshot.facts.botHandlers} bot handlers, had ${minHandlers}`);
  }
  const commands = stringList(criterion.params.commands);
  if (commands.length > 0) {
    const codeText = ctx.files.filter((file) => file.kind === 'code').map((file) => file.content ?? '');
    const gone = commands.filter((name) => !codeText.some((text) => text.includes(name)));
    if (gone.length > 0) return result(criterion, false, `Handler gone: ${gone.join(', ')}`);
  }
  const share = criterion.params.movedLinesShare;
  if (typeof share === 'number') return movedLines(quest, criterion, files, share, evidence);
  return result(criterion, true, files.length > 0 ? 'Files exist and are used' : 'Nothing to check');
}

/** The old file shrank by at least `share`, and the project did not lose those lines (they moved, not vanished). */
function movedLines(
  quest: Quest,
  criterion: Criterion,
  files: string[],
  share: number,
  evidence: Evidence,
): CriterionResult {
  const before = files.reduce((sum, file) => sum + (quest.baseline.fileLines[file] ?? 0), 0);
  const after = files.reduce((sum, file) => sum + (evidence.snapshot.facts.fileLines[file] ?? 0), 0);
  if (before > 0 && after > before * (1 - share)) {
    return result(
      criterion,
      false,
      `${after} of ${before} lines still in the file, need at most ${Math.floor(before * (1 - share))}`,
    );
  }
  const lost = quest.baseline.codeLines - evidence.snapshot.facts.codeLines;
  if (lost > before * SPLIT_LOSS_TOLERANCE) {
    return result(criterion, false, `The project lost ${lost} lines: code was deleted, not moved`);
  }
  return result(criterion, true, `File is ${after} lines (was ${before}); the rest was moved`);
}

function testsCover(criterion: Criterion, evidence: Evidence): CriterionResult {
  const module = String(criterion.params.module ?? '');
  const { ctx } = evidence;
  if (!ctx.byPath.has(module)) return result(criterion, false, `${module} is gone`, true);
  const found = testsFor(ctx, module);
  if (found.cases < MIN_CASES || found.assertions < MIN_ASSERTIONS) {
    return result(
      criterion,
      false,
      `${found.cases} test cases and ${found.assertions} assertions import ${module}, need ${MIN_CASES} and ${MIN_ASSERTIONS}`,
    );
  }
  return result(criterion, true, `${found.cases} test cases, ${found.assertions} assertions`);
}

function compile(pattern: unknown): RegExp | null {
  try {
    return new RegExp(String(pattern), 'm');
  } catch {
    return null;
  }
}

function patternPresent(criterion: Criterion, evidence: Evidence): CriterionResult {
  const regex = compile(criterion.params.pattern);
  if (regex === null) return result(criterion, false, 'Invalid pattern');
  const files = stringList(criterion.params.files);
  const { ctx } = evidence;
  const missing = files.filter((file) => !ctx.byPath.has(file));
  if (missing.length > 0) return result(criterion, false, `Missing: ${missing.join(', ')}`, true);
  const scope = files.length > 0 ? files : ctx.files.filter((file) => file.kind === 'code').map((file) => file.path);
  const hit = scope.find((file) => regex.test(ctx.byPath.get(file)?.content ?? ''));
  return hit === undefined
    ? result(criterion, false, `Pattern not found in ${files.length > 0 ? files.join(', ') : 'the project code'}`)
    : result(criterion, true, `Found in ${hit}`);
}

function patternAbsent(criterion: Criterion, evidence: Evidence): CriterionResult {
  const { ctx } = evidence;
  const keys = stringList(criterion.params.secretKeys);
  if (keys.length > 0) {
    const wanted = new Set(keys);
    const left = evidence.snapshot.findings.filter(
      (finding) => finding.rule === 'generic/hardcoded-secret' && wanted.has(stripIndex(finding.key)),
    );
    return left.length > 0
      ? result(criterion, false, `The secret is still in ${[...new Set(left.map((f) => f.file))].join(', ')}`)
      : result(criterion, true, 'The value is nowhere in the project');
  }
  const files = stringList(criterion.params.files);
  const pattern = criterion.params.pattern;
  if (pattern === undefined) {
    const left = files.filter((file) => ctx.byPath.has(file));
    return left.length > 0
      ? result(criterion, false, `Still there: ${left.join(', ')}`)
      : result(criterion, true, 'Deleted');
  }
  const regex = compile(pattern);
  if (regex === null) return result(criterion, false, 'Invalid pattern');
  const hit = files.find((file) => regex.test(ctx.byPath.get(file)?.content ?? ''));
  return hit === undefined
    ? result(criterion, true, 'Pattern not found')
    : result(criterion, false, `Pattern still in ${hit}`);
}

function commandPasses(criterion: Criterion, evidence: Evidence): CriterionResult {
  const name = String(criterion.params.command) as CommandName;
  if (evidence.snapshot.facts.commands[name] === undefined)
    return result(criterion, false, `No ${name} command in the project`);
  const run = currentRun(evidence, name);
  if (run === undefined) return result(criterion, false, `${name} has not been run for the current files`);
  return run.ok
    ? result(criterion, true, `${name} passed in ${Math.round(run.durationMs / 1000)}s`)
    : result(criterion, false, `${name} failed (exit ${run.exitCode ?? 'timeout'})`);
}

/** Spec §8.1: no new high/critical findings in changed files, no fewer test cases, green tests if they ran. */
function noRegressions(quest: Quest, criterion: Criterion, evidence: Evidence): CriterionResult {
  const { baseline } = quest;
  const problems: string[] = [];
  const known = new Set(baseline.highFindings);
  const fresh = evidence.snapshot.findings.filter(
    (finding) =>
      (finding.severity === 'high' || finding.severity === 'critical') &&
      !known.has(finding.id) &&
      (evidence.changed === null || (finding.file !== undefined && evidence.changed.has(finding.file))),
  );
  if (fresh.length > 0) problems.push(`${fresh.length} new high/critical findings (${fresh[0]?.rule})`);

  const cases = evidence.snapshot.facts.testCasesTotal;
  if (cases < baseline.testCasesTotal) problems.push(`test cases dropped from ${baseline.testCasesTotal} to ${cases}`);
  for (const [module, before] of Object.entries(baseline.testCasesByModule)) {
    if (!evidence.ctx.byPath.has(module)) continue;
    const now = evidence.snapshot.facts.testCasesByModule[module] ?? 0;
    if (now < before) problems.push(`tests of ${module} dropped from ${before} to ${now}`);
  }
  const test = currentRun(evidence, 'test');
  if (test !== undefined && !test.ok) problems.push('tests are failing');
  return problems.length > 0
    ? result(criterion, false, problems.join('; '))
    : result(criterion, true, 'No regressions');
}
