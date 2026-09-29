import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runGit } from '../../src/analyzer/git.js';
import { copyFixture, FAKE_SECRETS } from '../helpers/fixtures.js';
import { cleanupTempDirs } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

describe('copyFixture', () => {
  it('turns stand-ins into dot-files and fills fake secrets', async () => {
    const dir = await copyFixture('harness', { git: false });
    expect(await readFile(path.join(dir, '.gitignore'), 'utf8')).toBe('node_modules/\n');
    expect(await readFile(path.join(dir, '.env.example'), 'utf8')).toBe(`BOT_TOKEN=${FAKE_SECRETS.TELEGRAM}\n`);
    await expect(access(path.join(dir, '_gitignore'))).rejects.toThrow();
    expect((await runGit(dir, ['rev-parse', '--git-dir'])).ok).toBe(false);
  });

  it('commits the copy to a fresh git repository by default', async () => {
    const dir = await copyFixture('harness');
    const listed = await runGit(dir, ['ls-files']);
    expect(listed.stdout.split('\n').filter(Boolean).sort()).toEqual(['.env.example', '.gitignore', 'src/app.ts']);
  });
});
