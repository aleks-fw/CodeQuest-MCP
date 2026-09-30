import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { listFiles } from '../../src/analyzer/files.js';
import { readHead } from '../../src/analyzer/history.js';
import { readChangedFiles } from '../../src/verification/changed.js';
import { clampTimeoutSec, needsRun, type RunOutcome, runCommand } from '../../src/verification/commands.js';
import { cleanupTempDirs, commitAll, makeGitProject, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

const NOW = new Date('2026-09-30T12:00:00.000Z');

async function run(cwd: string, script: string, timeoutMs = 20_000): Promise<RunOutcome> {
  const file = path.join(cwd, 'job.js');
  await writeFile(file, script);
  return runCommand({ cwd, command: 'node job.js', timeoutMs, changeKey: 'k1', now: () => NOW });
}

describe('runCommand', () => {
  it('reports exit code 0, the change key and the output tail; sets CI=1', async () => {
    const dir = await makeTempDir();
    const outcome = await run(dir, "console.log('CI=' + process.env.CI, 'COLOR=' + process.env.FORCE_COLOR);");
    if (!('run' in outcome)) throw new Error('expected a run');
    expect(outcome.run).toMatchObject({ ok: true, exitCode: 0, changeKey: 'k1', at: NOW.toISOString() });
    expect(outcome.run.tail).toContain('CI=1 COLOR=0');
  });

  it('a failing command is not ok; keeps only the last 50 lines and the failed-tests count', async () => {
    const dir = await makeTempDir();
    const outcome = await run(
      dir,
      "for (let i = 0; i < 80; i++) console.log('line ' + i); console.log('3 failed'); process.exit(2);",
    );
    if (!('run' in outcome)) throw new Error('expected a run');
    expect(outcome.run.ok).toBe(false);
    expect(outcome.run.exitCode).toBe(2);
    expect(outcome.run.failedTests).toBe(3);
    const lines = outcome.run.tail.split('\n');
    expect(lines).toHaveLength(50);
    expect(lines.at(-1)).toBe('3 failed');
  });

  it('kills a command that runs too long', async () => {
    const dir = await makeTempDir();
    const started = Date.now();
    const outcome = await run(dir, 'setInterval(() => {}, 1000);', 1500);
    if (!('run' in outcome)) throw new Error('expected a run');
    expect(outcome.run.ok).toBe(false);
    expect(outcome.run.exitCode).toBeNull();
    expect(outcome.run.tail).toContain('timed out');
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  it('treats a missing Python module as an unavailable command', async () => {
    const dir = await makeTempDir();
    const outcome = await run(dir, "console.error('/usr/bin/python: No module named pytest'); process.exit(1);");
    expect(outcome).toEqual({ unavailable: 'No module named pytest' });
  });
});

describe('timeouts and reuse', () => {
  it('keeps the timeout between 30 and 1800 seconds, default 300', () => {
    expect(clampTimeoutSec(undefined)).toBe(300);
    expect(clampTimeoutSec(5)).toBe(30);
    expect(clampTimeoutSec(99999)).toBe(1800);
    expect(clampTimeoutSec(120)).toBe(120);
  });

  it('runs again only when the change key moved', () => {
    const last = { ok: true, exitCode: 0, durationMs: 1, changeKey: 'a', at: '', tail: '' };
    expect(needsRun(undefined, 'a')).toBe(true);
    expect(needsRun(last, 'a')).toBe(false);
    expect(needsRun(last, 'b')).toBe(true);
  });
});

describe('readChangedFiles', () => {
  it('in git: edits since the remembered HEAD, committed or not, and new files', async () => {
    const dir = await makeGitProject({ 'a.ts': 'a\n', 'b.ts': 'b\n', 'c.ts': 'c\n' });
    const head = await readHead(dir);
    await writeFile(path.join(dir, 'a.ts'), 'a2\n');
    await commitAll(dir, 'change a');
    await writeFile(path.join(dir, 'b.ts'), 'b2\n');
    await writeFile(path.join(dir, 'new.ts'), 'n\n');
    const listing = await listFiles(dir);
    const changed = await readChangedFiles(dir, { head, takenAt: NOW.toISOString() }, listing.files, true);
    expect([...(changed ?? [])].sort()).toEqual(['a.ts', 'b.ts', 'new.ts']);
  });

  it('outside git: files modified after the quest appeared', async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, 'old.ts'), 'o\n');
    await writeFile(path.join(dir, 'fresh.ts'), 'f\n');
    const listing = await listFiles(dir);
    const old = listing.files.find((file) => file.path === 'old.ts');
    const takenAt = new Date((old?.mtimeMs ?? 0) - 1000).toISOString();
    const both = await readChangedFiles(dir, { head: null, takenAt }, listing.files, false);
    expect([...(both ?? [])].sort()).toEqual(['fresh.ts', 'old.ts']);
    const none = await readChangedFiles(
      dir,
      { head: null, takenAt: new Date(Date.now() + 60_000).toISOString() },
      listing.files,
      false,
    );
    expect(none?.size).toBe(0);
    expect(await readChangedFiles(dir, { head: null, takenAt: 'garbage' }, listing.files, false)).toBeNull();
  });
});
