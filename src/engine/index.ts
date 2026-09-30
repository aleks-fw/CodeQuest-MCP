import path from 'node:path';
import { CodeQuestError } from '../errors.js';
import { levelForXp } from '../game/levels.js';
import { findQuest } from '../game/quests/board.js';
import { notificationLines } from '../hud/notifications.js';
import type { Lang } from '../i18n/index.js';
import { readJson } from '../storage/atomic.js';
import { readLanguage, writeLanguage } from '../storage/config.js';
import { appendEvents } from '../storage/journal.js';
import { emptyState, openProject, ProjectStore, readProfile } from '../storage/store.js';
import type { GameEvent, Profile, ProjectRecord, ProjectRef, ProjectState, Quest, Snapshot } from '../types.js';
import { clampTimeoutSec } from '../verification/commands.js';
import { type CycleOptions, type CycleResult, mergeRunFindings, runCycle } from './cycle.js';
import type { EngineEnv, ProjectRequest } from './env.js';
import { resolveProject } from './project.js';

export type { CycleResult, QuestReport } from './cycle.js';
export type { EngineEnv, ProjectRequest } from './env.js';

/** What the tools show: the result of a cycle, or the last saved state while a long operation is running. */
export interface ProjectView {
  project: ProjectRef;
  record: ProjectRecord;
  state: ProjectState;
  snapshot: Snapshot | null;
  /** Another operation (a test run) is in progress: this is the last saved state. */
  busy: boolean;
  /** Events of this cycle, for callers that report what happened. */
  events: GameEvent[];
  reports: CycleResult['reports'];
  unavailable: CycleResult['unavailable'];
  lang: Lang;
}

export interface SettingsChange {
  allowCommands?: boolean;
  commandTimeoutSec?: number;
}

/**
 * One engine per process: it serializes the operations of a project (spec §2.3) and remembers the project last used,
 * which the poller watches.
 */
export class Engine {
  private readonly queue = new Map<string, Promise<unknown>>();
  private readonly running = new Set<string>();
  private last: ProjectRef | null = null;

  constructor(readonly env: EngineEnv) {}

  /** The project of the last request, if any. */
  get lastProject(): ProjectRef | null {
    return this.last;
  }

  /** project_path → first client root → server folder; from there up to the git root (spec §9.1). */
  async resolve(request: ProjectRequest = {}): Promise<ProjectRef> {
    const explicit = request.projectPath?.trim() ? request.projectPath : undefined;
    const start = explicit ?? (await this.env.getRoots?.())?.[0] ?? this.env.cwd;
    const project = await resolveProject(path.resolve(this.env.cwd, start));
    this.last = project;
    return project;
  }

  /** Current state; refreshes first unless the change key says nothing moved. Never waits for a running check. */
  async view(request: ProjectRequest = {}): Promise<ProjectView> {
    const project = await this.resolve(request);
    if (this.running.has(project.id)) return this.saved(project);
    return toView(await this.enqueue(project, {}), false, await this.language());
  }

  /** `codequest refresh` / refresh_project_analysis: analysis without the cache. */
  async refresh(request: ProjectRequest = {}, force = true): Promise<ProjectView> {
    const project = await this.resolve(request);
    return toView(await this.enqueue(project, { force }), false, await this.language());
  }

  /** The "Проверить квест" button (spec §8.3): checks one quest or all open ones, even with findings left. */
  async verify(request: ProjectRequest = {}, quest?: string): Promise<ProjectView> {
    const project = await this.resolve(request);
    return toView(
      await this.enqueue(project, { verify: quest === undefined ? {} : { quest } }),
      false,
      await this.language(),
    );
  }

  /** Poller entry: a cycle for the last used project, skipped while an operation runs or nothing was used yet. */
  async poll(): Promise<CycleResult | null> {
    const project = this.last;
    if (project === null || this.running.has(project.id)) return null;
    return this.enqueue(project, {});
  }

  async setSettings(request: ProjectRequest, change: SettingsChange): Promise<ProjectView> {
    const project = await this.resolve(request);
    const { store } = await openProject(this.env.home, project, null);
    await this.enqueueRaw(project, async () => {
      await store.withLock(async () => {
        const record = await store.readRecord();
        if (record === null) throw new CodeQuestError('Project record is missing');
        const next: ProjectRecord = { ...record };
        if (change.allowCommands !== undefined) next.allowCommands = change.allowCommands;
        if (change.commandTimeoutSec !== undefined) next.commandTimeoutSec = clampTimeoutSec(change.commandTimeoutSec);
        if (JSON.stringify(next) === JSON.stringify(record)) return;
        await store.writeRecord(next);
        await appendEvents(store.file('events'), [
          {
            at: this.env.now().toISOString(),
            type: 'settings_changed',
            data: { allowCommands: next.allowCommands, commandTimeoutSec: next.commandTimeoutSec },
          },
        ]);
      });
    });
    // New rules for commands change the quests (starred conditions) and the Testing stat: analyse again.
    return toView(await this.enqueue(project, { force: true }), false, await this.language());
  }

  /** A quest of the current board by number, prefix or title. */
  async quest(request: ProjectRequest, reference: string): Promise<{ view: ProjectView; quest: Quest }> {
    const view = await this.view(request);
    const open = view.state.quests.filter((item) => item.status === 'open');
    const found = findQuest(open, reference, await this.language());
    if ('error' in found) throw new CodeQuestError(found.error);
    return { view, quest: found.quest };
  }

  /**
   * "Take to work" on the terminal board: marks an open quest and journals it. Only a marker: XP is paid after the
   * check whether or not a quest was taken. Taking a quest twice changes nothing.
   */
  async accept(request: ProjectRequest, reference: string): Promise<{ view: ProjectView; quest: Quest }> {
    const { view, quest } = await this.quest(request, reference);
    const { store } = await openProject(this.env.home, view.project, null);
    const accepted = await this.enqueueRaw(view.project, () =>
      store.withLock(async () => {
        const at = this.env.now().toISOString();
        const { state } = await store.loadState(levelForXp, at);
        const target = state.quests.find((item) => item.id === quest.id && item.status === 'open');
        if (target === undefined) throw new CodeQuestError(`Quest "${quest.title}" is no longer open`);
        if (target.acceptedAt !== undefined) return target;
        target.acceptedAt = at;
        await appendEvents(store.file('events'), [
          {
            at,
            type: 'quest_accepted',
            data: {
              id: target.id,
              title: target.title,
              template: target.template,
              ...(target.vars ? { vars: target.vars } : {}),
            },
          },
        ]);
        await store.writeState(state);
        return target;
      }),
    );
    return { view: await this.view(request), quest: accepted };
  }

  /**
   * The notifications not shown yet (spec §9.6): the lines for the journal events after the pointer, which then moves
   * to the end of the journal so each event is shown once.
   */
  async notifications(project: ProjectRef): Promise<string[]> {
    const { store } = await openProject(this.env.home, project, null);
    const lang = await this.language();
    return this.enqueueRaw(project, () =>
      store.withLock(async () => {
        const at = this.env.now().toISOString();
        const { state, events } = await store.loadState(levelForXp, at);
        const fresh = events.filter((event) => event.seq > state.shownEventSeq);
        const last = events.at(-1);
        if (fresh.length === 0 || last === undefined) return [];
        state.shownEventSeq = last.seq;
        await store.writeState(state);
        return notificationLines(fresh, lang);
      }),
    );
  }

  /** Every project of the profile (spec §9.2 get_player_level). */
  profile(): Promise<Profile> {
    return readProfile(this.env.home);
  }

  /** The store of a project, for the notification pointer. */
  storeOf(project: ProjectRef): ProjectStore {
    return new ProjectStore(this.env.home, project.id);
  }

  /** The language setting, read from the data folder each time so a switch made elsewhere shows at once. */
  language(): Promise<Lang> {
    return readLanguage(this.env.home);
  }

  setLanguage(lang: Lang): Promise<void> {
    return writeLanguage(this.env.home, lang);
  }

  private async saved(project: ProjectRef): Promise<ProjectView> {
    const { store, record } = await openProject(this.env.home, project, null);
    const raw = await readJson(store.file('state'));
    const state =
      raw.status === 'ok' && typeof raw.value === 'object' && raw.value !== null
        ? (raw.value as ProjectState)
        : emptyState(levelForXp);
    const snapshot = await store.readSnapshot();
    return {
      project,
      record,
      state,
      snapshot: snapshot === null ? null : mergeRunFindings(snapshot, state, record.allowCommands),
      busy: true,
      events: [],
      reports: [],
      unavailable: [],
      lang: await this.language(),
    };
  }

  private enqueue(project: ProjectRef, options: CycleOptions): Promise<CycleResult> {
    return this.enqueueRaw(project, () => runCycle(this.env, project, options));
  }

  private enqueueRaw<T>(project: ProjectRef, work: () => Promise<T>): Promise<T> {
    const before = this.queue.get(project.id) ?? Promise.resolve();
    const run = before
      .catch(() => undefined)
      .then(async () => {
        this.running.add(project.id);
        try {
          return await work();
        } finally {
          this.running.delete(project.id);
        }
      });
    this.queue.set(
      project.id,
      run.catch(() => undefined),
    );
    return run;
  }
}

function toView(result: CycleResult, busy: boolean, lang: Lang): ProjectView {
  return {
    project: result.project,
    record: result.record,
    state: result.state,
    snapshot: result.snapshot,
    busy,
    events: result.events,
    reports: result.reports,
    unavailable: result.unavailable,
    lang,
  };
}
