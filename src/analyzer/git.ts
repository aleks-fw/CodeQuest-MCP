import { execFile } from 'node:child_process';

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** Exit code; null when git could not be started. */
  code: number | null;
}

export type GitFailure = 'not-repo' | 'no-git' | 'no-commits' | 'other';

/** Runs git in cwd and never throws: failures come back as ok=false (spec §3.1). */
export function runGit(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, windowsHide: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ ok: true, stdout, stderr, code: 0 });
          return;
        }
        const code = typeof error.code === 'number' ? error.code : null;
        resolve({ ok: false, stdout: stdout ?? '', stderr: stderr || error.message, code });
      },
    );
  });
}

export function classifyGitFailure(result: GitResult): GitFailure {
  const text = result.stderr.toLowerCase();
  if (result.code === null && /enoent|not found|not recognized/.test(text)) return 'no-git';
  if (text.includes('not a git repository')) return 'not-repo';
  if (/does not have any commits|unknown revision|bad revision 'head'/.test(text)) return 'no-commits';
  return 'other';
}
