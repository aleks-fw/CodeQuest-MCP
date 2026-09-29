import type { CriterionResult, Quest, Snapshot } from '../types.js';
import { evaluateCriterion } from './criteria.js';
import type { CommandName, Evidence } from './evidence.js';

export interface QuestVerdict {
  questId: string;
  results: CriterionResult[];
  outcome: 'completed' | 'obsolete' | 'open';
  /** A test/lint/build script differs from the one at quest time: its run counts with V = 0.8 (spec §8.5). */
  scriptChanged: boolean;
  /** Epics: one verdict per subtask that was still open. */
  subtasks?: QuestVerdict[];
}

export interface VerifyOptions {
  /** Script texts as they are now (Baseline.scripts has the old ones). */
  currentScripts: { test?: string; lint?: string; build?: string };
}

/**
 * Checks one quest (spec §8.3). All conditions met → completed. Findings gone but a file of the quest is gone too →
 * obsolete, no XP. Otherwise open. An epic is completed when all its subtasks are.
 */
export function verifyQuest(quest: Quest, evidence: Evidence, options: VerifyOptions): QuestVerdict {
  if (quest.subtasks !== undefined && quest.subtasks.length > 0) return verifyEpic(quest, evidence, options);
  const results = quest.criteria.map((criterion) => evaluateCriterion(quest, criterion, evidence));
  const ok = results.every((item) => item.ok);
  const gone = !evidence.snapshot.findings.some((finding) => quest.findings.includes(finding.id));
  const outcome = ok ? 'completed' : gone && results.some((item) => item.missing) ? 'obsolete' : 'open';
  return { questId: quest.id, results, outcome, scriptChanged: scriptChanged(quest, results, options) };
}

function verifyEpic(quest: Quest, evidence: Evidence, options: VerifyOptions): QuestVerdict {
  const subtasks = (quest.subtasks ?? []).filter((task) => task.status === 'open');
  const verdicts = subtasks.map((task) => verifyQuest(task, evidence, options));
  const unresolved = verdicts.filter((verdict) => verdict.outcome === 'open');
  const done =
    (quest.subtasks ?? []).some((task) => task.status === 'completed') ||
    verdicts.some((verdict) => verdict.outcome === 'completed');
  // Obsolete subtasks do not block the epic; an epic with nothing done at all is obsolete, not completed.
  const outcome: QuestVerdict['outcome'] = unresolved.length > 0 ? 'open' : done ? 'completed' : 'obsolete';
  return {
    questId: quest.id,
    results: [],
    outcome,
    scriptChanged: verdicts.some((verdict) => verdict.scriptChanged),
    subtasks: verdicts,
  };
}

function scriptChanged(quest: Quest, results: CriterionResult[], options: VerifyOptions): boolean {
  const used = new Set<CommandName>();
  quest.criteria.forEach((criterion, index) => {
    if (criterion.type === 'command_passes' && results[index]?.ok) used.add(criterion.params.command as CommandName);
  });
  if (quest.criteria.some((criterion) => criterion.type === 'no_regressions')) used.add('test');
  for (const name of used) {
    const before = quest.baseline.scripts[name];
    // A script that did not exist at quest time is the quest's own work (Add Test Command), not a trick.
    if (before !== undefined && before !== options.currentScripts[name]) return true;
  }
  return false;
}

/** Open quests whose findings are all gone from the snapshot: the automatic check is due for them (spec §8.3). */
export function autoDue(quest: Quest, snapshot: Pick<Snapshot, 'findings'>): boolean {
  if (quest.status !== 'open') return false;
  const ids = new Set(snapshot.findings.map((finding) => finding.id));
  const subtasks = quest.subtasks ?? [];
  if (subtasks.length > 0) return subtasks.some((task) => autoDue(task, snapshot));
  return quest.findings.length > 0 && quest.findings.every((id) => !ids.has(id));
}

/** Commands the given quests need run (spec §8.4): their command_passes, and test for every no_regressions. */
export function neededCommands(quests: readonly Quest[], available: { test?: string; lint?: string; build?: string }) {
  const names = new Set<CommandName>();
  const visit = (quest: Quest): void => {
    for (const criterion of quest.criteria) {
      if (criterion.type === 'command_passes') names.add(criterion.params.command as CommandName);
      if (criterion.type === 'no_regressions') names.add('test');
    }
    for (const task of quest.subtasks ?? []) if (task.status === 'open') visit(task);
  };
  for (const quest of quests) visit(quest);
  return [...names].filter((name) => available[name] !== undefined).sort();
}
