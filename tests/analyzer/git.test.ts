import { afterAll, describe, expect, it } from 'vitest';
import { classifyGitFailure, runGit } from '../../src/analyzer/git.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

describe('classifyGitFailure', () => {
  it.each([
    [128, 'fatal: not a git repository (or any of the parent directories): .git', 'not-repo'],
    [null, 'spawn git ENOENT', 'no-git'],
    [128, "fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.", 'no-commits'],
    [128, "fatal: detected dubious ownership in repository at 'D:/x'", 'other'],
  ] as const)('code %s, "%s" → %s', (code, stderr, expected) => {
    expect(classifyGitFailure({ ok: false, stdout: '', stderr, code })).toBe(expected);
  });
});

describe('runGit', () => {
  it('reports failure without throwing outside a repository', async () => {
    const dir = await makeTempDir();
    const result = await runGit(dir, ['rev-parse', '--show-toplevel']);
    expect(result.ok).toBe(false);
    expect(classifyGitFailure(result)).toBe('not-repo');
  });
});
