import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CodeQuestError } from '../errors.js';

export interface LockOptions {
  /** A lock older than this is taken over (spec §5: 30 s). */
  staleMs?: number;
  /** How long to wait for a held lock (spec §5: 10 s). */
  waitMs?: number;
  retryMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  pid?: number;
}

const LOCK_NAME = '.lock';

interface LockInfo {
  pid: number;
  at: number;
  token: string;
}

/** Runs fn while holding <dir>/.lock. The lock file holds pid and time; a stale one is removed. */
export async function withLock<T>(dir: string, fn: () => Promise<T>, options: LockOptions = {}): Promise<T> {
  const staleMs = options.staleMs ?? 30_000;
  const waitMs = options.waitMs ?? 10_000;
  const retryMs = options.retryMs ?? 50;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const file = path.join(dir, LOCK_NAME);
  await mkdir(dir, { recursive: true });

  const info: LockInfo = { pid: options.pid ?? process.pid, at: now(), token: randomBytes(8).toString('hex') };
  const deadline = now() + waitMs;
  for (;;) {
    try {
      await writeFile(file, JSON.stringify({ ...info, at: now() }), { flag: 'wx' });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const holder = await readHolder(file);
    if (holder === 'gone') continue;
    if (now() - holder.at > staleMs) {
      await rm(file, { force: true });
      continue;
    }
    if (now() >= deadline) {
      const pid = holder.pid ?? 'unknown';
      throw new CodeQuestError(`Project data is locked by another process (pid ${pid}); try again`, {
        key: 'error.locked',
        vars: { pid },
      });
    }
    await sleep(retryMs);
  }
  try {
    return await fn();
  } finally {
    await release(file, info.token);
  }
}

/** The holder's info; a half-written lock file is judged by its modification time. */
async function readHolder(file: string): Promise<{ pid?: number; at: number } | 'gone'> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return 'gone';
  }
  try {
    const parsed = JSON.parse(text) as Partial<LockInfo>;
    if (typeof parsed.at === 'number') return { pid: parsed.pid, at: parsed.at };
  } catch {
    // fall through to the file time
  }
  const info = await stat(file).catch(() => null);
  return info ? { at: info.mtimeMs } : 'gone';
}

/** Removes the lock only when it is still ours: after a takeover the file belongs to someone else. */
async function release(file: string, token: string): Promise<void> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<LockInfo>;
    if (parsed.token === token) await rm(file, { force: true });
  } catch {
    // already gone or unreadable: nothing to release
  }
}
