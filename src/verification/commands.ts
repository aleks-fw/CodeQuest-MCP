import { spawn } from 'node:child_process';
import { constants, setPriority } from 'node:os';
import type { CommandRun } from '../types.js';

export const DEFAULT_TIMEOUT_SEC = 300;
export const MIN_TIMEOUT_SEC = 30;
export const MAX_TIMEOUT_SEC = 1800;
const TAIL_LINES = 50;
const MAX_OUTPUT_CHARS = 1_000_000;
const MISSING_MODULE = /No module named/;
const FAILED_COUNT = /(\d+)\s+failed/i;

export interface RunOptions {
  cwd: string;
  /** Text from Facts.commands: never user input, only what the analyzer derived from the project (spec §8.4). */
  command: string;
  timeoutMs: number;
  changeKey: string;
  now: () => Date;
}

export type RunOutcome = { run: CommandRun } | { unavailable: string };

/** Keeps a configured timeout inside 30–1800 s (spec §8.4). */
export function clampTimeoutSec(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_TIMEOUT_SEC;
  return Math.min(MAX_TIMEOUT_SEC, Math.max(MIN_TIMEOUT_SEC, Math.round(value)));
}

/** A run counts for the current files only; commands run at most once per change key (spec §8.3). */
export function needsRun(last: CommandRun | undefined, changeKey: string): boolean {
  return last === undefined || last.changeKey !== changeKey;
}

/** Least time between two automatic runs of one command: a project under edit must not run its whole test suite all day. */
export const COMMAND_COOLDOWN_MS = 10 * 60 * 1000;

/** An automatic run is due when the files changed since the last run and the last run is old enough. */
export function canAutoRun(last: CommandRun | undefined, changeKey: string, now: Date, cooldownMs: number): boolean {
  if (!needsRun(last, changeKey)) return false;
  return last === undefined || now.getTime() - Date.parse(last.at) >= cooldownMs;
}

/** Runs a project command in its folder with CI=1 and no colours; the whole process tree dies on timeout. */
export function runCommand(options: RunOptions): Promise<RunOutcome> {
  const started = Date.now();
  const at = options.now().toISOString();
  return new Promise((resolve) => {
    // A shell is needed on Windows for npm.cmd; on POSIX detached lets us kill the whole group.
    const child = spawn(options.command, {
      cwd: options.cwd,
      shell: true,
      windowsHide: true,
      detached: process.platform !== 'win32',
      // Few test workers: the run takes longer, but the machine stays usable while it goes.
      env: { ...process.env, CI: '1', FORCE_COLOR: '0', VITEST_MAX_WORKERS: process.env.VITEST_MAX_WORKERS ?? '2' },
    });
    // Below normal priority, so the editor and the rest of the system win over the check; children inherit it.
    try {
      if (child.pid !== undefined) setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL);
    } catch {
      // The process is already gone or the system refuses: the run goes on at normal priority.
    }
    let output = '';
    let timedOut = false;
    const collect = (chunk: Buffer): void => {
      if (output.length < MAX_OUTPUT_CHARS) output += chunk.toString('utf8');
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, options.timeoutMs);
    const finish = (exitCode: number | null): void => {
      clearTimeout(timer);
      if (exitCode !== 0 && MISSING_MODULE.test(output)) {
        resolve({ unavailable: output.match(/No module named [^\r\n]*/)?.[0] ?? 'module is not installed' });
        return;
      }
      const tail = output
        .split(/\r?\n/)
        .filter((line) => line !== '')
        .slice(-TAIL_LINES)
        .join('\n');
      const failed = Number(FAILED_COUNT.exec(output)?.[1]);
      const run: CommandRun = {
        ok: !timedOut && exitCode === 0,
        exitCode: timedOut ? null : exitCode,
        durationMs: Date.now() - started,
        changeKey: options.changeKey,
        at,
        tail: timedOut ? `${tail}\n[timed out after ${Math.round(options.timeoutMs / 1000)}s]`.trim() : tail,
      };
      if (Number.isFinite(failed)) run.failedTests = failed;
      resolve({ run });
    };
    child.on('error', (error) => {
      output += error.message;
      finish(-1);
    });
    child.on('close', (code) => finish(code));
  });
}

function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // The process already ended.
  }
}
