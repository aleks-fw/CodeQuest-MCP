import { readdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import type { GameEvent, Profile, ProjectRecord, ProjectRef, ProjectState, Snapshot, Stats } from '../types.js';
import { readJson, writeJsonAtomic } from './atomic.js';
import { readEvents, sumXp } from './journal.js';
import { withLock } from './lock.js';
import { PROJECT_FILES, profileFile, projectDir, projectsDir, SCHEMA } from './paths.js';

export const DEFAULT_COMMAND_TIMEOUT_SEC = 300;

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value);

export function emptyStats(): Stats {
  return {
    architecture: 0,
    testing: 0,
    security: 0,
    performance: 0,
    cleanCode: 0,
    reliability: 0,
    maintainability: 0,
    bugs: 0,
    techDebt: 0,
  };
}

export function emptyState(levelForXp: (xp: number) => number): ProjectState {
  return {
    schema: SCHEMA,
    xp: 0,
    level: levelForXp(0),
    stats: emptyStats(),
    quests: [],
    paidFindings: [],
    shownEventSeq: 0,
    lastRuns: {},
  };
}

/** Everything under one project folder; writes should happen inside `withProjectLock`. */
export class ProjectStore {
  readonly dir: string;

  constructor(
    readonly home: string,
    readonly id: string,
  ) {
    this.dir = projectDir(home, id);
  }

  file(name: keyof typeof PROJECT_FILES): string {
    return path.join(this.dir, PROJECT_FILES[name]);
  }

  withLock<T>(fn: () => Promise<T>): Promise<T> {
    return withLock(this.dir, fn);
  }

  async readRecord(): Promise<ProjectRecord | null> {
    const result = await readJson(this.file('record'));
    return result.status === 'ok' && isRecord(result.value) ? result.value : null;
  }

  writeRecord(record: ProjectRecord): Promise<void> {
    return writeJsonAtomic(this.file('record'), record);
  }

  /** The cached snapshot; a missing or unreadable cache is just null (a new analysis rebuilds it). */
  async readSnapshot(): Promise<Snapshot | null> {
    const result = await readJson(this.file('snapshot'));
    return result.status === 'ok' && isObj(result.value) && result.value.schema === SCHEMA
      ? (result.value as unknown as Snapshot)
      : null;
  }

  writeSnapshot(snapshot: Snapshot): Promise<void> {
    return writeJsonAtomic(this.file('snapshot'), snapshot);
  }

  writeState(state: ProjectState): Promise<void> {
    return writeJsonAtomic(this.file('state'), state);
  }

  /**
   * state.json, checked against the journal (spec §5). A missing state with an empty journal is a new project. A broken
   * file, or XP that differs from the journal's sum, is set aside as state.broken-<time>.json and the state is rebuilt
   * from the journal (XP, level, paid findings); quests and stats come back from the next analysis.
   */
  async loadState(
    levelForXp: (xp: number) => number,
    at: string,
  ): Promise<{ state: ProjectState; events: GameEvent[]; recovered: boolean }> {
    const { events } = await readEvents(this.file('events'));
    const result = await readJson(this.file('state'));
    const journalXp = sumXp(events);
    if (result.status === 'ok' && isState(result.value) && result.value.xp === journalXp) {
      return { state: result.value, events, recovered: false };
    }
    if (result.status === 'missing' && events.length === 0) {
      return { state: emptyState(levelForXp), events, recovered: false };
    }
    if (result.status !== 'missing') {
      await rename(this.file('state'), path.join(this.dir, `state.broken-${at.replace(/[^\dA-Za-z]/g, '-')}.json`));
    }
    const state = emptyState(levelForXp);
    state.xp = journalXp;
    state.level = levelForXp(journalXp);
    state.paidFindings = paidFindings(events);
    state.shownEventSeq = events.at(-1)?.seq ?? 0;
    await this.writeState(state);
    return { state, events, recovered: true };
  }
}

/**
 * The store of a project (spec §5). A project opened under a new path keeps its old id when the first commit matches
 * a record whose path no longer exists; the path is updated. Otherwise a record is created.
 */
export async function openProject(
  home: string,
  ref: ProjectRef,
  firstCommit: string | null,
): Promise<{ store: ProjectStore; record: ProjectRecord; created: boolean }> {
  const direct = new ProjectStore(home, ref.id);
  const existing = await direct.readRecord();
  if (existing) return { store: direct, record: await refreshPath(direct, existing, ref), created: false };

  const moved = firstCommit === null ? null : await findMoved(home, firstCommit, ref.root);
  if (moved) {
    const store = new ProjectStore(home, moved.id);
    return { store, record: await refreshPath(store, moved.record, ref), created: false };
  }
  const record: ProjectRecord = {
    schema: SCHEMA,
    path: ref.root,
    name: ref.name,
    firstCommit,
    allowCommands: false,
    commandTimeoutSec: DEFAULT_COMMAND_TIMEOUT_SEC,
  };
  await direct.withLock(() => direct.writeRecord(record));
  return { store: direct, record, created: true };
}

export async function readProfile(home: string): Promise<Profile> {
  const result = await readJson(profileFile(home));
  return result.status === 'ok' && isProfile(result.value) ? result.value : { schema: SCHEMA, projects: [] };
}

/** Inserts or replaces the project's line in profile.json, sorted by id so the file is stable. */
export function updateProfile(home: string, entry: Profile['projects'][number]): Promise<Profile> {
  return withLock(home, async () => {
    const profile = await readProfile(home);
    const projects = [...profile.projects.filter((item) => item.id !== entry.id), entry].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    const next: Profile = { schema: SCHEMA, projects };
    await writeJsonAtomic(profileFile(home), next);
    return next;
  });
}

async function refreshPath(store: ProjectStore, record: ProjectRecord, ref: ProjectRef): Promise<ProjectRecord> {
  if (record.path === ref.root && record.name === ref.name) return record;
  const next = { ...record, path: ref.root, name: ref.name };
  await store.withLock(() => store.writeRecord(next));
  return next;
}

async function findMoved(
  home: string,
  firstCommit: string,
  newRoot: string,
): Promise<{ id: string; record: ProjectRecord } | null> {
  const ids = await readdir(projectsDir(home)).catch(() => [] as string[]);
  for (const id of ids.sort()) {
    const record = await new ProjectStore(home, id).readRecord();
    if (record?.firstCommit !== firstCommit || record.path === newRoot) continue;
    // The old path still exists: this is a second clone, not a move.
    if (
      await stat(record.path).then(
        () => true,
        () => false,
      )
    )
      continue;
    return { id, record };
  }
  return null;
}

function paidFindings(events: readonly GameEvent[]): string[] {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type !== 'xp' || !Array.isArray(event.data.findings)) continue;
    for (const id of event.data.findings) if (typeof id === 'string') ids.add(id);
  }
  return [...ids].sort();
}

function isRecord(value: unknown): value is ProjectRecord {
  return (
    isObj(value) &&
    value.schema === SCHEMA &&
    typeof value.path === 'string' &&
    typeof value.name === 'string' &&
    typeof value.allowCommands === 'boolean' &&
    typeof value.commandTimeoutSec === 'number' &&
    (value.firstCommit === null || typeof value.firstCommit === 'string')
  );
}

function isState(value: unknown): value is ProjectState {
  return (
    isObj(value) &&
    value.schema === SCHEMA &&
    typeof value.xp === 'number' &&
    typeof value.level === 'number' &&
    isObj(value.stats) &&
    Array.isArray(value.quests) &&
    Array.isArray(value.paidFindings) &&
    typeof value.shownEventSeq === 'number' &&
    isObj(value.lastRuns)
  );
}

function isProfile(value: unknown): value is Profile {
  return isObj(value) && value.schema === SCHEMA && Array.isArray(value.projects);
}
