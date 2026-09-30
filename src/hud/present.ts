import type { ProjectView } from '../engine/index.js';
import { levelProgress, titleForLevel } from '../game/levels.js';
import { LEVEL_DECAY } from '../game/xp.js';
import { t } from '../i18n/index.js';
import type { Profile, Quest } from '../types.js';
import { formatHud, formatMinimal } from './hud.js';
import { statLabel, titleOf } from './notifications.js';
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
    lang: view.lang,
  });

export const hudText = (view: ProjectView, minimal = false): string =>
  minimal ? formatMinimal(view.state.xp, view.lang) : formatHud(view.state.xp, view.state.stats, view.lang);

export const boardText = (view: ProjectView): string =>
  formatBoard(view.project.name, view.state.level, view.state.quests, view.lang);

export const statsText = (view: ProjectView): string =>
  formatStats(view.state.stats, view.snapshot?.findings ?? [], 8, view.lang);

export function levelText(view: ProjectView, profile: Profile): string {
  const progress = levelProgress(view.state.xp);
  const { lang } = view;
  const lines = [
    t(lang, 'level.line', {
      project: view.project.name,
      level: progress.level,
      title: titleForLevel(progress.level, lang),
      xp: view.state.xp,
    }),
    progress.max
      ? t(lang, 'level.max')
      : t(lang, 'level.toNext', { n: progress.xpToNext ?? 0, next: progress.level + 1 }),
    t(lang, 'level.multiplier', { value: (LEVEL_DECAY ** (progress.level - 1)).toFixed(2) }),
    '',
    t(lang, 'level.projects'),
  ];
  for (const project of profile.projects) {
    lines.push(t(lang, 'level.project', { name: project.name, level: project.level, xp: project.xp }));
  }
  return lines.join('\n');
}

/** A quest card plus the files and lines of its findings (spec §9.2 get_quest_details). */
export function questText(view: ProjectView, quest: Quest): string {
  const ids = new Set([...quest.findings, ...(quest.subtasks ?? []).flatMap((task) => task.findings)]);
  const findings = (view.snapshot?.findings ?? []).filter((finding) => ids.has(finding.id));
  const lines = [formatQuestCard(quest, view.state.level, undefined, view.lang)];
  if (findings.length > 0) {
    lines.push('', t(view.lang, 'quest.where'));
    for (const finding of findings.slice(0, 20)) {
      const where =
        finding.file === undefined ? '' : ` ${finding.file}${finding.line === undefined ? '' : `:${finding.line}`}`;
      lines.push(`- ${finding.rule}${where} — ${finding.message}`);
    }
    if (findings.length > 20) lines.push(t(view.lang, 'stats.more', { n: findings.length - 20 }));
  }
  return lines.join('\n');
}

export const verifyText = (view: ProjectView): string => {
  const report = formatReport(view.reports, view.lang);
  const notes = view.unavailable.map((item) =>
    t(view.lang, 'state.skipped', { command: item.command, reason: item.reason }),
  );
  return [report, ...notes, '', hudText(view)].join('\n');
};

/** What refresh found: counts, new quests and stat changes. */
export function refreshText(view: ProjectView): string {
  const analysis = view.events.find((event) => event.type === 'analysis');
  const opened = view.events.filter((event) => event.type === 'quest_opened');
  const { lang } = view;
  const lines = [t(lang, 'refresh.line', { project: view.project.name, n: view.snapshot?.findings.length ?? 0 })];
  if (analysis === undefined) lines[0] = `${lines[0]}${t(lang, 'refresh.same')}`;
  const stats = (analysis?.data.stats ?? {}) as Record<string, [number, number]>;
  for (const [name, pair] of Object.entries(stats)) lines.push(`${statLabel(lang, name)}: ${pair[0]} → ${pair[1]}`);
  if (opened.length > 0)
    lines.push(t(lang, 'refresh.newQuests', { titles: opened.map((event) => titleOf(event.data, lang)).join(', ') }));
  const errors = view.snapshot?.errors ?? [];
  if (errors.length > 0)
    lines.push(
      t(lang, 'refresh.errors', { errors: errors.map((error) => `${error.rule}: ${error.message}`).join('; ') }),
    );
  return [...lines, '', hudText(view)].join('\n');
}

export function settingsText(view: ProjectView): string {
  const commands = Object.entries(view.snapshot?.facts.commands ?? {});
  if (!view.record.allowCommands) {
    return t(view.lang, 'settings.denied');
  }
  const list =
    commands.length === 0
      ? t(view.lang, 'settings.none')
      : commands.map(([name, command]) => `${name}: ${command}`).join('; ');
  return t(view.lang, 'settings.allowed', { sec: view.record.commandTimeoutSec, list });
}

export { shortId };
