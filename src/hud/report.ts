import { hudTitle } from '../game/levels.js';
import { questTitle } from '../game/quests/text.js';
import { type Lang, t } from '../i18n/index.js';
import type { CriterionResult, Facts, Finding, Quest, Snapshot, Stats } from '../types.js';
import { formatHud } from './hud.js';
import { STAT_LABELS, statLabel } from './notifications.js';
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

const outcomeText = (lang: Lang, outcome: ReportItem['verdict']['outcome']): string => t(lang, `outcome.${outcome}`);

/** The ✓/✗ report of an explicit check (spec §8.3). */
export function formatReport(items: readonly ReportItem[], lang: Lang = 'en'): string {
  if (items.length === 0) return t(lang, 'report.none');
  return items.map((item) => formatItem(item, lang)).join('\n\n');
}

function formatItem(item: ReportItem, lang: Lang): string {
  const { quest, verdict } = item;
  const lines = [t(lang, 'report.check', { title: questTitle(quest, lang), id: shortId(quest) })];
  const subtasks = quest.subtasks ?? [];
  if (subtasks.length > 0) {
    for (const task of subtasks) {
      const sub = verdict.subtasks?.find((entry) => entry.questId === task.id);
      const outcome =
        sub?.outcome ?? (task.status === 'completed' ? 'completed' : task.status === 'obsolete' ? 'obsolete' : 'open');
      lines.push(`${outcome === 'completed' ? '✓' : outcome === 'obsolete' ? '–' : '✗'} ${questTitle(task, lang)}`);
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
  let summary = t(lang, 'report.result', { outcome: outcomeText(lang, verdict.outcome) });
  if (verdict.outcome === 'completed') {
    summary += ` · +${item.xp} XP`;
    if (item.stat !== undefined && item.stat.from !== item.stat.to) {
      summary += ` · ${statLabel(lang, item.stat.name)} ${item.stat.from} → ${item.stat.to}`;
    }
    if (verdict.scriptChanged) summary += t(lang, 'report.scriptChanged');
    if (item.xp === 0) summary += t(lang, 'report.paid');
  }
  lines.push(summary);
  if (item.levelAfter > item.levelBefore) {
    lines.push(
      t(lang, 'notif.levelup', { from: item.levelBefore, to: item.levelAfter, title: hudTitle(item.levelAfter, lang) }),
    );
  }
  return lines.join('\n');
}

const CATEGORY_STAT_KEY: Record<string, string> = {
  architecture: 'architecture',
  security: 'security',
  performance: 'performance',
  'clean-code': 'cleanCode',
  reliability: 'reliability',
  maintainability: 'maintainability',
  testing: 'testing',
  bug: 'bugs',
};
const SEVERITY_RANK: Record<Finding['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Every stat and the findings that pull them down, worst first (spec §9.2 get_project_stats). */
export function formatStats(stats: Stats, findings: readonly Finding[], limit = 8, lang: Lang = 'en'): string {
  const lines = [t(lang, 'stats.title')];
  for (const name of Object.keys(STAT_LABELS) as (keyof Stats)[])
    lines.push(`${statLabel(lang, name)}: ${stats[name]}`);
  const worst = [...findings]
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0),
    )
    .slice(0, limit);
  if (worst.length > 0) {
    lines.push('', t(lang, 'stats.main'));
    for (const finding of worst) {
      const where =
        finding.file === undefined ? '' : ` ${finding.file}${finding.line === undefined ? '' : `:${finding.line}`}`;
      const statKey = CATEGORY_STAT_KEY[finding.category];
      const category = statKey === undefined ? finding.category : statLabel(lang, statKey);
      lines.push(`- [${t(lang, `severity.${finding.severity}`)}] ${category} · ${finding.rule}${where}`);
    }
    if (findings.length > worst.length) lines.push(t(lang, 'stats.more', { n: findings.length - worst.length }));
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
  lang?: Lang;
}

/** get_project_state: HUD, project type, hot files and the top of the board (spec §9.2). */
export function formatState(input: StateInput): string {
  const lang = input.lang ?? 'en';
  const lines = [`CodeQuest · ${input.projectName}`, formatHud(input.xp, input.stats, lang)];
  if (input.busy) lines.push('', t(lang, 'state.busy'));
  const { facts } = input;
  if (facts !== null) {
    const packs = facts.domains
      .filter((domain) => domain.pack !== 'generic')
      .map((d) => `${d.pack} (${Math.round(d.confidence * 100)}%)`);
    lines.push(
      '',
      t(lang, 'state.type', {
        packs: packs.length > 0 ? packs.join(', ') : t(lang, 'state.generic'),
        stacks: facts.stacks.join(', ') || t(lang, 'state.none'),
      }),
    );
    if (facts.hotspots.length > 0) lines.push(t(lang, 'state.hot', { files: facts.hotspots.slice(0, 5).join(', ') }));
  }
  lines.push(t(lang, input.allowCommands ? 'state.commandsAllowed' : 'state.commandsDenied'));
  for (const item of input.unavailable) {
    lines.push(t(lang, 'state.skipped', { command: item.command, reason: item.reason }));
  }
  const board = formatBoard(input.projectName, input.level, input.quests, lang);
  lines.push('', board);
  if (input.errors.length > 0) {
    lines.push('', t(lang, 'state.errors', { n: input.errors.length }));
    for (const error of input.errors.slice(0, 5)) lines.push(`- ${error.rule}: ${error.message}`);
  }
  return lines.join('\n');
}
