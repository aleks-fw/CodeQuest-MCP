import { execFile } from 'node:child_process';
import { type CliResult, parseCliOutput } from '../shared/state.js';

export interface RunOptions {
  node: string;
  cli: string;
  home: string;
  args: string[];
  cwd: string;
  /** Default 30 s; the check button passes a long one: CodeQuest enforces the timeout of the project commands itself. */
  timeoutMs?: number;
}

/** Runs `node <cli> <args>` with an argument array (no shell). Never rejects. */
export function runCodeQuest(options: RunOptions): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(
      options.node,
      [options.cli, ...options.args],
      {
        cwd: options.cwd,
        env: { ...process.env, CODEQUEST_HOME: options.home },
        timeout: options.timeoutMs ?? 30_000,
        windowsHide: true,
        maxBuffer: 8_000_000,
      },
      (error, stdout, stderr) => {
        if (error?.killed) {
          resolve({ ok: false, message: 'CodeQuest did not finish in time (timed out)' });
          return;
        }
        const parsed = parseCliOutput(stdout);
        if (parsed.ok || stdout.trim() !== '') {
          resolve(parsed);
          return;
        }
        const detail = (stderr.trim() || (error?.message ?? '')).split('\n').find((line) => line.trim() !== '');
        resolve({
          ok: false,
          message: detail === undefined ? parsed.message : `CodeQuest failed: ${detail.trim().slice(0, 200)}`,
        });
      },
    );
  });
}
