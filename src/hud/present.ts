import type { ProjectView } from '../engine/index.js';
import { levelProgress } from '../game/levels.js';
import { LEVEL_DECAY } from '../game/xp.js';
import type { Profile, Quest } from '../types.js';
import { formatHud, formatMinimal } from './hud.js';
import { STAT_LABELS } from './notifications.js';
import { formatBoard, formatQuestCard, shortId } from './quests.js';
import { formatReport, formatState, formatStats } from './report.js';

/** Text for each tool and CLI command, shared so both say the same thing. */

export const stateText = (view: ProjectView): string =>
  formatState({
    projectName: view.project.name,
    root: view.project.root,
    xp: view.state.xp,
    stats: view.state.stats,
    quests: view.state.quests,
    level: view.state.level,
    facts: view.snapshot?.facts ?? null,
    errors: view.snapshot?.errors ?? [],
    allowCommands: view.record.allowCommands,
    busy: view.busy,
    unavailable: view.unavailable,
  });

export const hudText = (view: ProjectView, minimal = false): string =>
  minimal ? formatMinimal(view.state.xp) : formatHud(view.state.xp, view.state.stats);

export const boardText = (view: ProjectView): string =>
  formatBoard(view.project.name, view.state.level, view.state.quests);

export const statsText = (view: ProjectView): string => formatStats(view.state.stats, view.snapshot?.findings ?? []);

export function levelText(view: ProjectView, profile: Profile): string {
  const progress = levelProgress(view.state.xp);
  const lines = [
    `${view.project.name}: LVL ${progress.level} · ${progress.title} · ${view.state.xp} XP`,
    progress.max ? 'MAX level reached; XP keeps counting.' : `${progress.xpToNext} XP to level ${progress.level + 1}.`,
    `Quest reward multiplier at this level: x${(LEVEL_DECAY ** (progress.level - 1)).toFixed(2)}.`,
    '',
    'Projects (each has its own XP):',
  ];
  for (const project of profile.projects) lines.push(`- ${project.name}: LVL ${project.level} · ${project.xp} XP`);
  return lines.join('\n');
}

/** A quest card plus the files and lines of its findings (spec §9.2 get_quest_details). */
export function questText(view: ProjectView, quest: Quest): string {
  const ids = new Set([...quest.findings, ...(quest.subtasks ?? []).flatMap((task) => task.findings)]);
  const findings = (view.snapshot?.findings ?? []).filter((finding) => ids.has(finding.id));
  const lines = [formatQuestCard(quest, view.state.level)];
  if (findings.length > 0) {
    lines.push('', 'Where:');
    for (const finding of findings.slice(0, 20)) {
      const where =
        finding.file === undefined ? '' : ` ${finding.file}${finding.line === undefined ? '' : `:${finding.line}`}`;
      lines.push(`- ${finding.rule}${where} — ${finding.message}`);
    }
    if (findings.length > 20) lines.push(`… and ${findings.length - 20} more`);
  }
  return lines.join('\n');
}

export const verifyText = (view: ProjectView): string => {
  const report = formatReport(view.reports);
  const notes = view.unavailable.map((item) => `Skipped ${item.command}: ${item.reason}`);
  return [report, ...notes, '', hudText(view)].join('\n');
};

/** What refresh found: counts, new quests and stat changes. */
export function refreshText(view: ProjectView): string {
  const analysis = view.events.find((event) => event.type === 'analysis');
  const opened = view.events.filter((event) => event.type === 'quest_opened');
  const lines = [`Analysis of ${view.project.name}: ${view.snapshot?.findings.length ?? 0} findings.`];
  if (analysis === undefined) lines[0] = `${lines[0]} Nothing changed since the last analysis.`;
  const stats = (analysis?.data.stats ?? {}) as Record<string, [number, number]>;
  for (const [name, pair] of Object.entries(stats)) lines.push(`${STAT_LABELS[name] ?? name}: ${pair[0]} → ${pair[1]}`);
  if (opened.length > 0) lines.push(`New quests: ${opened.map((event) => String(event.data.title)).join(', ')}`);
  const errors = view.snapshot?.errors ?? [];
  if (errors.length > 0)
    lines.push(`Run errors: ${errors.map((error) => `${error.rule}: ${error.message}`).join('; ')}`);
  return [...lines, '', hudText(view)].join('\n');
}

export function settingsText(view: ProjectView): string {
  const commands = Object.entries(view.snapshot?.facts.commands ?? {});
  if (!view.record.allowCommands) {
    return 'Project commands are NOT allowed. Nothing from the project will be run.';
  }
  const list =
    commands.length === 0 ? 'none found' : commands.map(([name, command]) => `${name}: ${command}`).join('; ');
  return `Project commands are allowed (timeout ${view.record.commandTimeoutSec}s). CodeQuest may run: ${list}.`;
}

export { shortId };
