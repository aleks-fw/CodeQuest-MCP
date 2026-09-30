import { analyzeWithContext } from '../analyzer/analyze.js';
import { listFiles } from '../analyzer/files.js';
import { findingId } from '../analyzer/findings.js';
import { runGit } from '../analyzer/git.js';
import { computeChangeKey, readHead } from '../analyzer/history.js';
import { CodeQuestError } from '../errors.js';
import { levelForXp } from '../game/levels.js';
import { buildBoard, findQuest } from '../game/quests/board.js';
import { CATEGORY_STAT, generateCandidates } from '../game/quests/generate.js';
import { computeStats } from '../game/stats.js';
import { awardForQuest, verificationFactor } from '../game/xp.js';
import { appendEvents, type NewEvent } from '../storage/journal.js';
import { openProject, updateProfile } from '../storage/store.js';
import type {
  CommandRun,
  Finding,
  GameEvent,
  ProjectRecord,
  ProjectRef,
  ProjectState,
  Quest,
  Snapshot,
  Stats,
} from '../types.js';
import { readChangedFiles } from '../verification/changed.js';
import { needsRun, runCommand } from '../verification/commands.js';
import type { CommandName, Evidence } from '../verification/evidence.js';
import { autoDue, neededCommands, type QuestVerdict, verifyQuest } from '../verification/verify.js';
import type { EngineEnv } from './env.js';

const COMMAND_NAMES: readonly CommandName[] = ['test', 'lint', 'build'];

export interface CycleOptions {
  /** Analyse even when the change key matches the cache. */
  force?: boolean;
  /** An explicit check (spec §8.3): one quest by reference, or every open quest. */
  verify?: { quest?: string };
}

/** What happened to one quest in this cycle. */
export interface QuestReport {
  quest: Quest;
  verdict: QuestVerdict;
  /** XP given; 0 for anything but a completed quest. */
  xp: number;
  levelBefore: number;
  levelAfter: number;
  /** The stat of the quest's category before and after this cycle, when it is one that moves. */
  stat?: { name: keyof Stats; from: number; to: number };
}

export interface CycleResult {
  project: ProjectRef;
  record: ProjectRecord;
  state: ProjectState;
  /** The last analysis with the synthetic failing-tests finding merged in. */
  snapshot: Snapshot | null;
  /** Events written in this cycle. */
  events: GameEvent[];
  reports: QuestReport[];
  /** False when the cached snapshot was still valid and nothing was done. */
  analyzed: boolean;
  /** Commands that could not run (a Python module is missing) with the reason. */
  unavailable: { command: CommandName; reason: string }[];
}

/** The run of a command for the files as they are now. */
const currentRunOf = (state: ProjectState, name: CommandName, changeKey: string): CommandRun | undefined => {
  const run = state.lastRuns[name];
  return run?.changeKey === changeKey ? run : undefined;
};

/** "The last test run failed" is not a rule of the scanner: it is a finding of the run itself (spec §3.3). */
export function mergeRunFindings(snapshot: Snapshot, state: ProjectState, allowed: boolean): Snapshot {
  const run = currentRunOf(state, 'test', snapshot.changeKey);
  if (!allowed || run === undefined || run.ok) return snapshot;
  const rule = 'generic/failing-tests';
  const failing: Finding = {
    id: findingId(rule, undefined, 'tests'),
    rule,
    category: 'bug',
    severity: 'high',
    message: 'The last test run failed',
    key: 'tests',
  };
  return { ...snapshot, findings: [...snapshot.findings, failing] };
}

function statsOf(snapshot: Snapshot, state: ProjectState, allowed: boolean): Stats {
  const run = currentRunOf(state, 'test', snapshot.changeKey);
  return computeStats({
    snapshot,
    commandsAllowed: allowed,
    lastTestRun: run === undefined ? null : { passed: run.ok, failedTests: run.failedTests ?? 1 },
  });
}

async function firstCommit(root: string): Promise<string | null> {
  const result = await runGit(root, ['rev-list', '--max-parents=0', 'HEAD']);
  const line = result.ok ? result.stdout.split(/\r?\n/)[0]?.trim() : '';
  return line ? line : null;
}

/**
 * The scenario of spec §2.2 in one locked pass: cache check → analysis → commands → checks → XP → board → files.
 * Nothing is written before the whole pass has worked out its result, except the journal, which comes before the
 * state so a crash between them is repaired from the journal.
 */
export async function runCycle(env: EngineEnv, ref: ProjectRef, options: CycleOptions = {}): Promise<CycleResult> {
  const { store, record } = await openProject(env.home, ref, await firstCommit(ref.root));
  return store.withLock(async () => {
    const at = env.now().toISOString();
    const loaded = await store.loadState(levelForXp, at);
    const state = loaded.state;
    const previous = await store.readSnapshot();
    const explicit = options.verify !== undefined;

    const listing = await listFiles(ref.root);
    const head = listing.isGitRepo ? await readHead(ref.root) : null;
    const changeKey = computeChangeKey(head, listing.files);
    if (!options.force && !explicit && previous?.changeKey === changeKey) {
      const snapshot = mergeRunFindings(previous, state, record.allowCommands);
      return { project: ref, record, state, snapshot, events: [], reports: [], analyzed: false, unavailable: [] };
    }

    const { snapshot: raw, ctx } = await analyzeWithContext(ref.root, { now: env.now() });
    const allowed = record.allowCommands;
    const statsBefore = { ...state.stats };
    const events: NewEvent[] = [];
    const unavailable: CycleResult['unavailable'] = [];

    // Which quests are checked now.
    const open = state.quests.filter((quest) => quest.status === 'open');
    let targets: Quest[];
    if (options.verify?.quest !== undefined && options.verify.quest !== '') {
      const found = findQuest(open, options.verify.quest);
      if ('error' in found) throw new CodeQuestError(found.error);
      targets = [found.quest];
    } else if (explicit) {
      targets = open;
    } else {
      targets = open.filter((quest) => autoDue(quest, mergeRunFindings(raw, state, allowed)));
    }

    // Commands run at most once per change key and only when a quest needs them (spec §8.3–8.4).
    if (allowed && targets.length > 0) {
      const run = env.runCommand ?? runCommand;
      for (const name of neededCommands(targets, raw.facts.commands)) {
        if (!needsRun(state.lastRuns[name], raw.changeKey)) continue;
        const command = raw.facts.commands[name];
        if (command === undefined) continue;
        const outcome = await run({
          cwd: ref.root,
          command,
          timeoutMs: record.commandTimeoutSec * 1000,
          changeKey: raw.changeKey,
          now: env.now,
        });
        if ('unavailable' in outcome) unavailable.push({ command: name, reason: outcome.unavailable });
        else state.lastRuns[name] = outcome.run;
      }
    }

    const snapshot = mergeRunFindings(raw, state, allowed);
    const stats = statsOf(snapshot, state, allowed);
    const reports: QuestReport[] = [];

    // Verdicts and XP.
    const changedCache = new Map<string, Set<string> | null>();
    for (const target of targets) {
      const key = `${target.baseline.head}|${target.baseline.takenAt}`;
      if (!changedCache.has(key)) {
        changedCache.set(key, await readChangedFiles(ref.root, target.baseline, listing.files, listing.isGitRepo));
      }
      const runs: Evidence['runs'] = {};
      for (const name of COMMAND_NAMES) {
        const run = currentRunOf(state, name, snapshot.changeKey);
        if (run !== undefined) runs[name] = run;
      }
      const evidence: Evidence = { ctx, snapshot, changed: changedCache.get(key) ?? null, runs };
      const verdict = verifyQuest(target, evidence, { currentScripts: raw.facts.scripts });
      const report = applyVerdict(target, verdict, state, snapshot, runs, allowed, at, events, explicit);
      const statName = CATEGORY_STAT[target.category];
      if (statName !== null && verdict.outcome === 'completed') {
        report.stat = { name: statName, from: statsBefore[statName], to: stats[statName] };
        const done = events.find((event) => event.type === 'quest_completed' && event.data?.id === target.id);
        if (done?.data !== undefined && report.stat.from !== report.stat.to) done.data.stat = report.stat;
      }
      reports.push(report);
    }

    // The board: open quests stay, free places are filled from the fresh candidates.
    const stillOpen = state.quests.filter((quest) => quest.status === 'open');
    const candidates = generateCandidates({
      snapshot,
      stats,
      commandsAllowed: allowed,
      scripts: raw.facts.scripts,
      now: at,
    });
    const board = buildBoard({ candidates, open: stillOpen, stats, now: at });
    for (const quest of board.opened) {
      events.push({
        at,
        type: 'quest_opened',
        data: { id: quest.id, title: quest.title, difficulty: quest.difficulty },
      });
    }
    const opened = new Set(board.opened.map((quest) => quest.id));
    const history = state.quests.filter((quest) => quest.status !== 'open' && !opened.has(quest.id));
    state.quests = [...history, ...board.quests];

    // A paid finding that was gone and is back (spec §8.5).
    if (previous !== null) {
      const before = new Set(previous.findings.map((finding) => finding.id));
      const paid = new Set(state.paidFindings);
      for (const finding of snapshot.findings) {
        if (paid.has(finding.id) && !before.has(finding.id)) {
          events.push({
            at,
            type: 'finding_returned',
            data: { id: finding.id, rule: finding.rule, ...(finding.file === undefined ? {} : { file: finding.file }) },
          });
        }
      }
    }

    if (previous?.changeKey !== changeKey) {
      const changes: Record<string, [number, number]> = {};
      for (const name of Object.keys(stats) as (keyof Stats)[]) {
        if (previous !== null && Math.abs(stats[name] - statsBefore[name]) >= 1) {
          changes[name] = [statsBefore[name], stats[name]];
        }
      }
      events.push({
        at,
        type: 'analysis',
        data: { changeKey, findings: snapshot.findings.length, errors: raw.errors.length, stats: changes },
      });
    }

    state.stats = stats;
    state.level = levelForXp(state.xp);
    const written = await appendEvents(store.file('events'), events);
    await store.writeSnapshot(raw);
    await store.writeState(state);
    await updateProfile(env.home, {
      id: ref.id,
      name: record.name,
      path: ref.root,
      level: state.level,
      xp: state.xp,
      updatedAt: at,
    });
    return { project: ref, record, state, snapshot, events: written, reports, analyzed: true, unavailable };
  });
}

/** Moves one verdict into the state and the event list; returns what the caller shows. */
function applyVerdict(
  quest: Quest,
  verdict: QuestVerdict,
  state: ProjectState,
  snapshot: Snapshot,
  runs: Evidence['runs'],
  allowed: boolean,
  at: string,
  events: NewEvent[],
  explicit: boolean,
): QuestReport {
  const levelBefore = state.level;
  const report: QuestReport = { quest, verdict, xp: 0, levelBefore, levelAfter: levelBefore };
  const index = state.quests.findIndex((item) => item.id === quest.id);
  if (index < 0) return report;
  const next: Quest = { ...quest };
  if (verdict.results.length > 0) next.lastCheck = verdict.results;

  for (const sub of verdict.subtasks ?? []) {
    const task = next.subtasks?.find((item) => item.id === sub.questId);
    if (task === undefined) continue;
    if (sub.outcome === 'completed') task.status = 'completed';
    if (sub.outcome === 'obsolete') {
      task.status = 'obsolete';
      events.push({ at, type: 'quest_obsolete', data: { id: task.id, title: task.title, epic: quest.title } });
    }
    if (sub.outcome === 'open') task.lastCheck = sub.results;
    if (sub.outcome === 'completed' && verdict.outcome === 'open') {
      const left = (next.subtasks ?? []).filter((item) => item.status === 'open').length;
      events.push({ at, type: 'epic_progress', data: { id: quest.id, title: quest.title, subtask: task.title, left } });
    }
  }

  if (verdict.outcome === 'completed') {
    const needed = neededCommands([quest], allowed ? snapshot.facts.commands : {});
    const factor = verificationFactor({
      ranAnyCommand: needed.some((name) => runs[name] !== undefined),
      allGreen: needed.length > 0 && needed.every((name) => runs[name]?.ok === true),
      scriptsUnchanged: !verdict.scriptChanged,
    });
    const award = awardForQuest(quest, state.level, factor, state.paidFindings);
    state.xp += award.amount;
    state.paidFindings = [...new Set([...state.paidFindings, ...award.findings])].sort();
    next.status = 'completed';
    next.completedAt = at;
    next.xpAwarded = award.amount;
    report.xp = award.amount;
    events.push({
      at,
      type: 'quest_completed',
      data: {
        id: quest.id,
        title: quest.title,
        difficulty: quest.difficulty,
        category: quest.category,
        xp: award.amount,
        factor,
        scriptChanged: verdict.scriptChanged,
      },
    });
    if (award.amount > 0) {
      events.push({
        at,
        type: 'xp',
        data: { amount: award.amount, quest: quest.id, findings: award.findings, factor },
      });
    }
    const levelAfter = levelForXp(state.xp);
    if (levelAfter > levelBefore) events.push({ at, type: 'level_up', data: { from: levelBefore, to: levelAfter } });
    state.level = levelAfter;
    report.levelAfter = levelAfter;
  } else if (verdict.outcome === 'obsolete') {
    next.status = 'obsolete';
    events.push({
      at,
      type: 'quest_obsolete',
      data: {
        id: quest.id,
        title: quest.title,
        reason: verdict.results.find((r) => r.missing)?.detail ?? 'file is gone',
      },
    });
  } else if (explicit) {
    events.push({
      at,
      type: 'verification_failed',
      data: { id: quest.id, title: quest.title, failed: verdict.results.filter((r) => !r.ok).map((r) => r.detail) },
    });
  }
  state.quests[index] = next;
  report.quest = next;
  return report;
}
