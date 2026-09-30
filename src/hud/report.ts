import { hudTitle } from '../game/levels.js';
import type { CriterionResult, Facts, Finding, Quest, Snapshot, Stats } from '../types.js';
import { formatHud } from './hud.js';
import { STAT_LABELS } from './notifications.js';
import { describeCriterion, formatBoard, shortId } from './quests.js';

/** One checked quest, as the engine reports it (structural, so this module stays free of engine imports). */
export interface ReportItem {
  quest: Quest;
  verdict: {
    outcome: 'completed' | 'obsolete' | 'open';
    results: CriterionResult[];
    scriptChanged: boolean;
    subtasks?: { questId: string; outcome: 'completed' | 'obsolete' | 'open'; results: CriterionResult[] }[];
  };
  xp: number;
  levelBefore: number;
  levelAfter: number;
  stat?: { name: keyof Stats; from: number; to: number };
}

const OUTCOME: Record<ReportItem['verdict']['outcome'], string> = {
  completed: 'COMPLETE',
  obsolete: 'OBSOLETE (the code it was about is gone; no XP)',
  open: 'NOT DONE YET',
};

/** The ✓/✗ report of an explicit check (spec §8.3). */
export function formatReport(items: readonly ReportItem[]): string {
  if (items.length === 0) return 'No open quests to check.';
  return items.map(formatItem).join('\n\n');
}

function formatItem(item: ReportItem): string {
  const { quest, verdict } = item;
  const lines = [`CHECK ${quest.title} · ${shortId(quest)}`];
  const subtasks = quest.subtasks ?? [];
  if (subtasks.length > 0) {
    for (const task of subtasks) {
      const sub = verdict.subtasks?.find((entry) => entry.questId === task.id);
      const outcome =
        sub?.outcome ?? (task.status === 'completed' ? 'completed' : task.status === 'obsolete' ? 'obsolete' : 'open');
      lines.push(`${outcome === 'completed' ? '✓' : outcome === 'obsolete' ? '–' : '✗'} ${task.title}`);
      for (const [index, result] of (sub?.results ?? []).entries()) {
        if (!result.ok)
          lines.push(
            `    ✗ ${task.criteria[index] ? describeCriterion(task.criteria[index]) : result.type} — ${result.detail}`,
          );
      }
    }
  } else {
    quest.criteria.forEach((criterion, index) => {
      const result = verdict.results[index];
      const mark = result === undefined ? '□' : result.ok ? '✓' : '✗';
      lines.push(
        `${mark} ${describeCriterion(criterion)}${result !== undefined && !result.ok ? ` — ${result.detail}` : ''}`,
      );
    });
  }
  let summary = `Result: ${OUTCOME[verdict.outcome]}`;
  if (verdict.outcome === 'completed') {
    summary += ` · +${item.xp} XP`;
    if (item.stat !== undefined && item.stat.from !== item.stat.to) {
      summary += ` · ${STAT_LABELS[item.stat.name] ?? item.stat.name} ${item.stat.from} → ${item.stat.to}`;
    }
    if (verdict.scriptChanged) summary += ' · a test/lint/build script was changed, so the reward is x0.8';
    if (item.xp === 0) summary += ' (its findings were already paid)';
  }
  lines.push(summary);
  if (item.levelAfter > item.levelBefore) {
    lines.push(`⚔️ LEVEL UP ${item.levelBefore} → ${item.levelAfter} · ${hudTitle(item.levelAfter)}`);
  }
  return lines.join('\n');
}

const CATEGORY_STAT: Record<string, string> = {
  architecture: 'Architecture',
  security: 'Security',
  performance: 'Performance',
  'clean-code': 'Clean Code',
  reliability: 'Reliability',
  maintainability: 'Maintainability',
  testing: 'Testing',
  bug: 'Bugs',
};
const SEVERITY_RANK: Record<Finding['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Every stat and the findings that pull them down, worst first (spec §9.2 get_project_stats). */
export function formatStats(stats: Stats, findings: readonly Finding[], limit = 8): string {
  const lines = ['STATS'];
  for (const name of Object.keys(STAT_LABELS) as (keyof Stats)[]) lines.push(`${STAT_LABELS[name]}: ${stats[name]}`);
  const worst = [...findings]
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0),
    )
    .slice(0, limit);
  if (worst.length > 0) {
    lines.push('', 'Main findings:');
    for (const finding of worst) {
      const where =
        finding.file === undefined ? '' : ` ${finding.file}${finding.line === undefined ? '' : `:${finding.line}`}`;
      lines.push(
        `- [${finding.severity}] ${CATEGORY_STAT[finding.category] ?? finding.category} · ${finding.rule}${where}`,
      );
    }
    if (findings.length > worst.length) lines.push(`… and ${findings.length - worst.length} more`);
  }
  return lines.join('\n');
}

export interface StateInput {
  projectName: string;
  root: string;
  xp: number;
  stats: Stats;
  quests: readonly Quest[];
  level: number;
  facts: Facts | null;
  errors: Snapshot['errors'];
  allowCommands: boolean;
  busy: boolean;
  unavailable: { command: string; reason: string }[];
}

/** get_project_state: HUD, project type, hot files and the top of the board (spec §9.2). */
export function formatState(input: StateInput): string {
  const lines = [`CodeQuest · ${input.projectName}`, formatHud(input.xp, input.stats)];
  if (input.busy) lines.push('', '⏳ A check is running; this is the last saved state.');
  const { facts } = input;
  if (facts !== null) {
    const packs = facts.domains
      .filter((domain) => domain.pack !== 'generic')
      .map((d) => `${d.pack} (${Math.round(d.confidence * 100)}%)`);
    lines.push(
      '',
      `Project type: ${packs.length > 0 ? packs.join(', ') : 'generic'} · stacks: ${facts.stacks.join(', ') || 'none'}`,
    );
    if (facts.hotspots.length > 0) lines.push(`Hot files: ${facts.hotspots.slice(0, 5).join(', ')}`);
  }
  lines.push(
    `Project commands: ${input.allowCommands ? 'allowed' : "not allowed (set_project_settings needs the user's consent)"}`,
  );
  for (const item of input.unavailable) lines.push(`Skipped ${item.command}: ${item.reason}`);
  const board = formatBoard(input.projectName, input.level, input.quests);
  lines.push('', board);
  if (input.errors.length > 0) {
    lines.push('', `Run errors (${input.errors.length}):`);
    for (const error of input.errors.slice(0, 5)) lines.push(`- ${error.rule}: ${error.message}`);
  }
  return lines.join('\n');
}
