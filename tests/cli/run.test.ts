import { rm } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { type CliIo, runCli } from '../../src/cli/run.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

async function setup() {
  const project = await copyFixture('projects/nextjs-shop');
  const home = await makeTempDir();
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = {
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    cwd: await makeTempDir(),
    env: {},
  };
  const run = (...argv: string[]) => runCli([...argv, '--home', home], io);
  return { project, home, out, err, run };
}

describe('codequest CLI commands', () => {
  it('hud prints the four-line HUD, and --minimal one line', async () => {
    const { project, out, run } = await setup();
    expect(await run('hud', '--path', project)).toBe(0);
    expect(out.join('')).toContain('⚔️ LVL 1 · NEWCOMER');
    expect(out.join('').split('\n').filter(Boolean)).toHaveLength(4);
    out.length = 0;
    expect(await run('hud', '--minimal', '--path', project)).toBe(0);
    expect(out.join('').trim()).toBe('⚔️ LVL 1 · NEWCOMER · 0 XP');
  });

  it('board, without a terminal, prints the HUD and the plain board', async () => {
    const { project, out, run } = await setup();
    expect(await run('board', '--path', project)).toBe(0);
    expect(out.join('')).toContain('⚔️ LVL 1 · NEWCOMER');
    expect(out.join('')).toContain('QUEST BOARD');
  });

  it('refresh reports the analysis; a second one says nothing changed', async () => {
    const { project, out, run } = await setup();
    expect(await run('refresh', '--force', '--path', project)).toBe(0);
    expect(out.join('')).toContain('findings.');
    expect(out.join('')).toContain('New quests:');
    out.length = 0;
    expect(await run('refresh', '--path', project)).toBe(0);
    expect(out.join('')).toContain('Nothing changed');
  });

  it('verify prints the ✓/✗ report; a finished quest is paid', async () => {
    const { project, out, run } = await setup();
    await run('hud', '--path', project);
    out.length = 0;
    expect(await run('verify', 'Clean Inventory', '--path', project)).toBe(0);
    expect(out.join('')).toContain('Result: NOT DONE YET');
    await rm(path.join(project, 'components', 'ProductBadge.tsx'));
    out.length = 0;
    expect(await run('verify', 'Clean Inventory', '--path', project)).toBe(0);
    expect(out.join('')).toContain('Result: COMPLETE · +80 XP');
  });

  it('exit code 1 with a readable message for an unknown quest, a bad path, a bad option and no command', async () => {
    const { project, err, run } = await setup();
    await run('hud', '--path', project);
    expect(await run('verify', 'nope', '--path', project)).toBe(1);
    expect(err.join('')).toContain('No quest "nope"');
    err.length = 0;
    expect(await run('hud', '--path', path.join(project, 'нет такой папки'))).toBe(1);
    expect(err.join('')).toContain('Path not found');
    err.length = 0;
    expect(await run('hud', '--bogus')).toBe(1);
    expect(err.join('')).toContain('Unknown option --bogus');
    err.length = 0;
    expect(await run('hud', '--path')).toBe(1);
    expect(err.join('')).toContain('--path needs a value');
    err.length = 0;
    expect(await runCli([], { stdout: () => {}, stderr: (t) => err.push(t), cwd: '', env: {} })).toBe(1);
    expect(err.join('')).toContain('Usage:');
  });
});
