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

describe('codequest state --json', () => {
  it('prints exactly one JSON document of version 1', async () => {
    const { project, out, run } = await setup();
    expect(await run('state', '--path', project)).toBe(0);
    const text = out.join('');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.trim().split('\n')).toHaveLength(1);
    const doc = JSON.parse(text);
    expect(doc.version).toBe(1);
    expect(doc.level).toBe(1);
    expect(doc.xp).toEqual({ current: 0, forLevel: 500, max: false });
    expect(doc.class).toBeNull();
    expect(doc.project.path).toContain('тест проект');
  });

  it('verify --json prints the same document shape', async () => {
    const { project, out, run } = await setup();
    expect(await run('verify', '--json', '--path', project)).toBe(0);
    const doc = JSON.parse(out.join(''));
    expect(doc.version).toBe(1);
    expect(typeof doc.busy).toBe('boolean');
  });

  it('prints an error document and exits 1 when the project is not found, in the saved language', async () => {
    const { out, err, home, run } = await setup();
    const missing = `${home}/нет такой папки`;
    expect(await run('state', '--path', missing)).toBe(1);
    const doc = JSON.parse(out.join(''));
    expect(typeof doc.error.key).toBe('string');
    expect(doc.error.message.length).toBeGreaterThan(0);
    expect(err.join('')).toBe('');
  });
});
