import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Baseline, Finding, Quest, Severity, Snapshot, Stats } from '../../types.js';
import { type CommandName, type Group, TEMPLATES, type Template, templateFor } from './templates.js';

export interface QuestInput {
  snapshot: Pick<Snapshot, 'facts' | 'findings' | 'head'>;
  stats: Stats;
  /** Project commands the user allowed to run (spec §5); starred conditions need this. */
  commandsAllowed: boolean;
  /** Script texts for `Baseline.scripts` (spec §8.2). */
  scripts: { test?: string; lint?: string; build?: string };
  /** ISO time, passed in: game code never reads the clock. */
  now: string;
}

export interface Candidate {
  quest: Quest;
  priority: number;
  /** Files the quest touches, sorted. */
  files: string[];
  template: Template;
}

const WEIGHTS: Record<Severity, number> = { critical: 10, high: 5, medium: 2, low: 1 };
const SEVERITY_ORDER: Severity[] = ['low', 'medium', 'high', 'critical'];
const MAX_BATCH = 10;
/** Rules whose findings always get a quest of their own (spec §7.2). */
const NO_BATCH: ReadonlySet<string> = new Set([
  'generic/hardcoded-secret',
  'shop/webhook-no-signature',
  'generic/import-cycle',
  'generic/untested-module',
]);

/** Which stat a quest category is weak in (spec §7.5); bugs are always 1.1. */
export const CATEGORY_STAT: Record<Quest['category'], keyof Stats | null> = {
  bug: null,
  testing: 'testing',
  architecture: 'architecture',
  security: 'security',
  performance: 'performance',
  refactoring: 'cleanCode',
  cleanup: 'cleanCode',
  reliability: 'reliability',
  documentation: 'maintainability',
  dependencies: 'maintainability',
  maintainability: 'maintainability',
};

/** All quests the findings could give, best first. Each finding is in exactly one candidate (spec §7.1). */
export function generateCandidates(input: QuestInput): Candidate[] {
  const { snapshot } = input;
  const packs = new Set(snapshot.facts.domains.map((domain) => domain.pack));
  packs.add('generic');
  const commands: Partial<Record<CommandName, string>> = {};
  if (input.commandsAllowed) {
    for (const name of ['test', 'lint', 'build'] as const) {
      const command = snapshot.facts.commands[name];
      if (command !== undefined) commands[name] = command;
    }
  }
  const highFindings = snapshot.findings
    .filter((finding) => finding.severity === 'high' || finding.severity === 'critical')
    .map((finding) => finding.id)
    .sort();
  const hot = new Set(snapshot.facts.hotspots);

  const candidates: Candidate[] = [];
  for (const { template, findings } of groupFindings(snapshot.findings, packs)) {
    const files = [
      ...new Set(findings.flatMap((finding) => (finding.file === undefined ? [] : [finding.file]))),
    ].sort();
    const group: Group = { findings, files };
    const ids = findings.map((finding) => finding.id).sort();
    const quest: Quest = {
      id: questId(template.id, findings),
      template: template.id,
      pack: template.pack,
      title: template.title(group),
      description: template.describe(group),
      category: template.category,
      difficulty: difficultyOf(template, findings, files),
      findings: ids,
      criteria: template.criteria(group, { facts: snapshot.facts, commands }),
      status: 'open',
      createdAt: input.now,
      baseline: baselineOf(input, ids, files, highFindings),
    };
    candidates.push({
      quest,
      priority: priorityOf(quest, template, findings, files, input.stats, hot),
      files,
      template,
    });
  }
  return candidates.sort(
    (a, b) => b.priority - a.priority || (a.quest.id < b.quest.id ? -1 : a.quest.id > b.quest.id ? 1 : 0),
  );
}

/** First 12 hex chars of sha256(template + sorted finding ids) (spec §7.7). */
export function questId(templateId: string, findings: readonly Finding[]): string {
  return questIdOf(
    templateId,
    findings.map((finding) => finding.id),
  );
}

/** Same id from plain finding ids (epics know only their subtasks' ids). */
export function questIdOf(templateId: string, findingIds: readonly string[]): string {
  const ids = [...findingIds].sort();
  return createHash('sha256')
    .update(`${templateId}\n${ids.join('\n')}`)
    .digest('hex')
    .slice(0, 12);
}

/** The 5-character number people see and type. */
export function shortId(id: string): string {
  return id.slice(0, 5);
}

interface Batch {
  template: Template;
  findings: Finding[];
}

/** One template per finding, then low/medium findings of one rule in one folder go together, ten at most (§7.2). */
function groupFindings(findings: readonly Finding[], packs: ReadonlySet<string>): Batch[] {
  const buckets = new Map<string, Batch>();
  const sorted = [...findings].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const finding of sorted) {
    const template = templateFor(finding, packs);
    if (!template) continue;
    const batchable =
      (finding.severity === 'low' || finding.severity === 'medium') &&
      finding.file !== undefined &&
      !NO_BATCH.has(finding.rule);
    const slot = batchable
      ? `${template.id}\n${finding.rule}\n${path.posix.dirname(finding.file ?? '')}`
      : `${template.id}\n${finding.id}`;
    const bucket = buckets.get(slot) ?? { template, findings: [] };
    bucket.findings.push(finding);
    buckets.set(slot, bucket);
  }
  const batches: Batch[] = [];
  for (const bucket of buckets.values()) {
    for (let index = 0; index < bucket.findings.length; index += MAX_BATCH) {
      batches.push({ template: bucket.template, findings: bucket.findings.slice(index, index + MAX_BATCH) });
    }
  }
  return batches;
}

function maxSeverity(findings: readonly Finding[]): Severity {
  let best = 0;
  for (const finding of findings) best = Math.max(best, SEVERITY_ORDER.indexOf(finding.severity));
  return SEVERITY_ORDER[best] ?? 'low';
}

/** Spec §7.3: by the worst severity; security and architecture are at least Medium; 3+ files from medium up is Hard. */
function difficultyOf(template: Template, findings: readonly Finding[], files: readonly string[]): Quest['difficulty'] {
  const severity = maxSeverity(findings);
  let level = severity === 'low' ? 0 : severity === 'medium' ? 1 : 2;
  if ((template.category === 'security' || template.category === 'architecture') && level < 1) level = 1;
  if (files.length >= 3 && severity !== 'low') level = 2;
  return (['easy', 'medium', 'hard'] as const)[level] ?? 'hard';
}

/** priority = weight × weakness × profile × hotness (spec §7.5). */
function priorityOf(
  quest: Quest,
  template: Template,
  findings: readonly Finding[],
  files: readonly string[],
  stats: Stats,
  hot: ReadonlySet<string>,
): number {
  const weight = Math.min(
    10,
    findings.reduce((sum, finding) => sum + WEIGHTS[finding.severity], 0),
  );
  const stat = CATEGORY_STAT[quest.category];
  const weakness = stat === null ? 1.1 : 0.1 + (100 - stats[stat]) / 100;
  const profile = template.pack === 'generic' ? 1 : 1.5;
  const hotness = files.some((file) => hot.has(file)) ? 1.2 : 1;
  return weight * weakness * profile * hotness;
}

function baselineOf(input: QuestInput, findings: string[], files: readonly string[], highFindings: string[]): Baseline {
  const { facts, head } = input.snapshot;
  const fileLines: Record<string, number> = {};
  for (const file of files) {
    const lines = facts.fileLines[file];
    if (lines !== undefined) fileLines[file] = lines;
  }
  return {
    head,
    takenAt: input.now,
    findings,
    highFindings,
    testCasesTotal: facts.testCasesTotal,
    testCasesByModule: { ...facts.testCasesByModule },
    codeLines: facts.codeLines,
    fileLines,
    botHandlers: facts.botHandlers,
    scripts: { ...input.scripts },
  };
}

export { TEMPLATES };
