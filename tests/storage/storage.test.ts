import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CodeQuestError } from '../../src/errors.js';
import { readJson, writeJsonAtomic } from '../../src/storage/atomic.js';
import { appendEvents, readEvents, sumXp } from '../../src/storage/journal.js';
import { withLock } from '../../src/storage/lock.js';
import { projectDir, resolveHome } from '../../src/storage/paths.js';
import { emptyState, openProject, ProjectStore, readProfile, updateProfile } from '../../src/storage/store.js';
import type { ProjectRef, Snapshot } from '../../src/types.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

const AT = '2026-09-30T10:00:00.000Z';
const levelForXp = (xp: number): number => Math.min(50, 1 + Math.floor(xp / 500));

describe('resolveHome', () => {
  it('prefers --home, then CODEQUEST_HOME, then ~/.codequest', () => {
    expect(resolveHome({ home: 'D:/a', env: { CODEQUEST_HOME: 'D:/b' } })).toBe(path.resolve('D:/a'));
    expect(resolveHome({ env: { CODEQUEST_HOME: 'D:/b' } })).toBe(path.resolve('D:/b'));
    expect(resolveHome({ env: {} })).toMatch(/\.codequest$/);
    expect(resolveHome({ env: { CODEQUEST_HOME: '' } })).toMatch(/\.codequest$/);
  });
});

describe('atomic json', () => {
  it('writes, reads back, replaces and leaves no temp files', async () => {
    const dir = await makeTempDir();
    const file = path.join(dir, 'a', 'x.json');
    await writeJsonAtomic(file, { schema: 1, n: 1 });
    await writeJsonAtomic(file, { schema: 1, n: 2 });
    expect(await readJson(file)).toEqual({ status: 'ok', value: { schema: 1, n: 2 } });
    expect(await readdir(path.dirname(file))).toEqual(['x.json']);
  });

  it('tells missing from broken', async () => {
    const dir = await makeTempDir();
    expect(await readJson(path.join(dir, 'none.json'))).toEqual({ status: 'missing' });
    await writeFile(path.join(dir, 'bad.json'), '{"a":');
    expect((await readJson(path.join(dir, 'bad.json'))).status).toBe('broken');
  });
});

describe('withLock', () => {
  it('serialises concurrent holders', async () => {
    const dir = await makeTempDir();
    const counter = path.join(dir, 'counter.txt');
    await writeFile(counter, '0');
    const bump = () =>
      withLock(dir, async () => {
        const value = Number(await readFile(counter, 'utf8'));
        await new Promise((resolve) => setTimeout(resolve, 5));
        await writeFile(counter, String(value + 1));
      });
    await Promise.all(Array.from({ length: 8 }, bump));
    expect(await readFile(counter, 'utf8')).toBe('8');
    expect((await readdir(dir)).includes('.lock')).toBe(false);
  });

  it('takes over a stale lock', async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, '.lock'), JSON.stringify({ pid: 1, at: 0, token: 'old' }));
    const result = await withLock(dir, async () => 'done', { now: () => 100_000 });
    expect(result).toBe('done');
  });

  it('gives up with a clear error while a fresh lock is held', async () => {
    const dir = await makeTempDir();
    let clock = 1_000_000;
    await writeFile(path.join(dir, '.lock'), JSON.stringify({ pid: 4242, at: clock, token: 'other' }));
    const attempt = withLock(dir, async () => 'no', {
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      waitMs: 200,
    });
    await expect(attempt).rejects.toThrow(CodeQuestError);
    await expect(attempt).rejects.toThrow(/locked by another process \(pid 4242\)/);
    expect(await readFile(path.join(dir, '.lock'), 'utf8')).toContain('other');
  });

  it('treats a half-written lock file by its file time and releases only its own lock', async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, '.lock'), '{"pid"');
    // Real clock: the file was just written, so it is fresh and the wait times out quickly.
    await expect(withLock(dir, async () => 1, { waitMs: 100, retryMs: 10 })).rejects.toThrow(/locked/);
    // A lock replaced while we hold it belongs to someone else and stays.
    await writeFile(path.join(dir, '.lock'), '');
    await withLock(
      dir,
      async () => {
        await writeFile(path.join(dir, '.lock'), JSON.stringify({ pid: 9, at: Date.now(), token: 'thief' }));
      },
      { staleMs: 0, now: () => Date.now() + 1 },
    ).catch(() => undefined);
    expect(await readFile(path.join(dir, '.lock'), 'utf8')).toContain('thief');
  });
});

describe('journal', () => {
  it('numbers events from 1, appends across calls and sums xp', async () => {
    const dir = await makeTempDir();
    const file = path.join(dir, 'events.jsonl');
    await appendEvents(file, [
      { at: AT, type: 'analysis' },
      { at: AT, type: 'xp', data: { amount: 100, findings: ['f1'] } },
    ]);
    const second = await appendEvents(file, [{ at: AT, type: 'xp', data: { amount: 50 } }]);
    expect(second.map((event) => event.seq)).toEqual([3]);
    const { events, skipped } = await readEvents(file);
    expect(events.map((event) => event.type)).toEqual(['analysis', 'xp', 'xp']);
    expect(skipped).toBe(0);
    expect(sumXp(events)).toBe(150);
  });

  it('skips a line cut off by a crash and keeps numbering after the last good event', async () => {
    const dir = await makeTempDir();
    const file = path.join(dir, 'events.jsonl');
    await appendEvents(file, [{ at: AT, type: 'analysis' }]);
    await writeFile(file, `${await readFile(file, 'utf8')}{"seq":2,"at":"x","ty`);
    const read = await readEvents(file);
    expect(read.events).toHaveLength(1);
    expect(read.skipped).toBe(1);
    expect(await readEvents(path.join(dir, 'missing.jsonl'))).toEqual({ events: [], skipped: 0 });
  });
});

async function newStore(): Promise<{ home: string; store: ProjectStore }> {
  const home = await makeTempDir();
  return { home, store: new ProjectStore(home, 'abc123abc123') };
}

describe('state recovery', () => {
  it('starts an empty state for a new project', async () => {
    const { store } = await newStore();
    const loaded = await store.loadState(levelForXp, AT);
    expect(loaded.recovered).toBe(false);
    expect(loaded.state).toEqual(emptyState(levelForXp));
  });

  it('returns a state that matches the journal untouched', async () => {
    const { store } = await newStore();
    await appendEvents(store.file('events'), [{ at: AT, type: 'xp', data: { amount: 120 } }]);
    const state = { ...emptyState(levelForXp), xp: 120 };
    await store.writeState(state);
    const loaded = await store.loadState(levelForXp, AT);
    expect(loaded.recovered).toBe(false);
    expect(loaded.state).toEqual(state);
  });

  it('sets a broken state aside and rebuilds xp, level and paid findings from the journal', async () => {
    const { store } = await newStore();
    await appendEvents(store.file('events'), [
      { at: AT, type: 'xp', data: { amount: 700, findings: ['f2', 'f1'] } },
      { at: AT, type: 'level_up' },
    ]);
    await mkdir(store.dir, { recursive: true });
    await writeFile(store.file('state'), '{ not json');
    const loaded = await store.loadState(levelForXp, AT);
    expect(loaded.recovered).toBe(true);
    expect(loaded.state).toMatchObject({ xp: 700, level: 2, paidFindings: ['f1', 'f2'], shownEventSeq: 2 });
    const names = await readdir(store.dir);
    expect(names).toContain('state.broken-2026-09-30T10-00-00-000Z.json');
    expect((await store.loadState(levelForXp, AT)).recovered).toBe(false);
  });

  it('treats xp that differs from the journal as damage', async () => {
    const { store } = await newStore();
    await appendEvents(store.file('events'), [{ at: AT, type: 'xp', data: { amount: 100 } }]);
    await store.writeState({ ...emptyState(levelForXp), xp: 999 });
    const loaded = await store.loadState(levelForXp, AT);
    expect(loaded.recovered).toBe(true);
    expect(loaded.state.xp).toBe(100);
  });

  it('rebuilds a missing state when the journal has events', async () => {
    const { store } = await newStore();
    await appendEvents(store.file('events'), [{ at: AT, type: 'xp', data: { amount: 500 } }]);
    const loaded = await store.loadState(levelForXp, AT);
    expect(loaded.recovered).toBe(true);
    expect(loaded.state.level).toBe(2);
    expect((await readdir(store.dir)).some((name) => name.startsWith('state.broken-'))).toBe(false);
  });
});

describe('snapshot cache', () => {
  it('round-trips a snapshot and treats junk as no cache', async () => {
    const { store } = await newStore();
    expect(await store.readSnapshot()).toBeNull();
    const snapshot = {
      schema: 1,
      takenAt: AT,
      changeKey: 'k',
      head: null,
      findings: [],
      errors: [],
    } as unknown as Snapshot;
    await store.writeSnapshot(snapshot);
    expect(await store.readSnapshot()).toEqual(snapshot);
    await writeFile(store.file('snapshot'), '[]');
    expect(await store.readSnapshot()).toBeNull();
  });
});

describe('openProject', () => {
  const ref = (root: string, id = 'aaaaaaaaaaaa'): ProjectRef => ({ id, name: path.basename(root), root });

  it('creates a record with commands off and the default timeout, then finds it again', async () => {
    const home = await makeTempDir();
    const root = await makeTempDir();
    const first = await openProject(home, ref(root), 'c0ffee');
    expect(first.created).toBe(true);
    expect(first.record).toEqual({
      schema: 1,
      path: root,
      name: path.basename(root),
      firstCommit: 'c0ffee',
      allowCommands: false,
      commandTimeoutSec: 300,
    });
    const again = await openProject(home, ref(root), 'c0ffee');
    expect(again.created).toBe(false);
    expect(again.store.dir).toBe(projectDir(home, 'aaaaaaaaaaaa'));
  });

  it('keeps the old id when the project moved (same first commit, old path gone)', async () => {
    const home = await makeTempDir();
    const oldRoot = path.join(await makeTempDir(), 'gone');
    const newRoot = await makeTempDir();
    await openProject(home, ref(oldRoot, 'oldoldoldold'), 'c0ffee');
    const moved = await openProject(home, ref(newRoot, 'newnewnewnew'), 'c0ffee');
    expect(moved.created).toBe(false);
    expect(moved.store.id).toBe('oldoldoldold');
    expect(moved.record.path).toBe(newRoot);
    expect((await moved.store.readRecord())?.path).toBe(newRoot);
  });

  it('gives a second clone with the same first commit its own id while the old path exists', async () => {
    const home = await makeTempDir();
    const firstRoot = await makeTempDir();
    const secondRoot = await makeTempDir();
    await openProject(home, ref(firstRoot, 'firstfirstfi'), 'c0ffee');
    const clone = await openProject(home, ref(secondRoot, 'secondsecond'), 'c0ffee');
    expect(clone.created).toBe(true);
    expect(clone.store.id).toBe('secondsecond');
  });

  it('never merges projects without a first commit', async () => {
    const home = await makeTempDir();
    await openProject(home, ref(path.join(await makeTempDir(), 'gone'), 'aaaaaaaaaaaa'), null);
    const other = await openProject(home, ref(await makeTempDir(), 'bbbbbbbbbbbb'), null);
    expect(other.created).toBe(true);
  });
});

describe('profile', () => {
  it('lists projects sorted by id and replaces a project line instead of duplicating it', async () => {
    const home = await makeTempDir();
    expect(await readProfile(home)).toEqual({ schema: 1, projects: [] });
    const entry = (id: string, xp: number) => ({ id, name: id, path: `D:/${id}`, level: 1, xp, updatedAt: AT });
    await updateProfile(home, entry('bbb', 10));
    await updateProfile(home, entry('aaa', 20));
    const profile = await updateProfile(home, entry('bbb', 30));
    expect(profile.projects.map((item) => [item.id, item.xp])).toEqual([
      ['aaa', 20],
      ['bbb', 30],
    ]);
    expect(await readProfile(home)).toEqual(profile);
  });
});

describe('withLock heartbeat', () => {
  const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  it('keeps its lock fresh while the work runs, so a slow job is not taken over', async () => {
    const dir = await makeTempDir();
    const order: string[] = [];
    const first = withLock(
      dir,
      async () => {
        order.push('first start');
        await pause(700);
        order.push('first end');
      },
      { staleMs: 200, heartbeatMs: 40 },
    );
    await pause(60);
    const second = withLock(
      dir,
      async () => {
        order.push('second');
      },
      { staleMs: 200, waitMs: 5000, retryMs: 20 },
    );
    await Promise.all([first, second]);
    expect(order).toEqual(['first start', 'first end', 'second']);
  });

  it('a holder that stopped beating (a crashed process) is still taken over', async () => {
    const dir = await makeTempDir();
    const order: string[] = [];
    const first = withLock(
      dir,
      async () => {
        order.push('first start');
        await pause(700);
        order.push('first end');
      },
      { staleMs: 200, heartbeatMs: 0 },
    );
    await pause(60);
    const second = withLock(
      dir,
      async () => {
        order.push('second');
      },
      { staleMs: 200, waitMs: 5000, retryMs: 20 },
    );
    await Promise.all([first, second]);
    expect(order).toEqual(['first start', 'second', 'first end']);
  });

  it('leaves no lock behind and no beat after the work ended', async () => {
    const dir = await makeTempDir();
    await withLock(dir, async () => pause(120), { staleMs: 90, heartbeatMs: 20 });
    expect((await readdir(dir)).includes('.lock')).toBe(false);
    await pause(150);
    expect((await readdir(dir)).includes('.lock')).toBe(false);
  });
});
