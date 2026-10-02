import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runCodeQuest } from '../../vscode-extension/src/host/cli.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

async function fakeCli(body: string): Promise<string> {
  const dir = await makeTempDir();
  const file = path.join(dir, 'fake cli.mjs');
  await writeFile(file, body);
  return file;
}
const doc = JSON.stringify({ version: 1, level: 7 });

describe('runCodeQuest', () => {
  it('passes args as an array (spaces, Cyrillic) and CODEQUEST_HOME, and parses the document', async () => {
    const cli = await fakeCli(
      `const [, , cmd, flag, value] = process.argv; console.log(JSON.stringify({ version: 1, level: cmd === 'state' && flag === '--path' && value === 'D:/проект 1/a b' && process.env.CODEQUEST_HOME === 'D:/home x' ? 7 : 1 }));`,
    );
    const result = await runCodeQuest({
      node: process.execPath,
      cli,
      home: 'D:/home x',
      args: ['state', '--path', 'D:/проект 1/a b'],
      cwd: process.cwd(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.level).toBe(7);
  });

  it('turns a non-zero exit with an error document into its message', async () => {
    const cli = await fakeCli(
      `console.log(JSON.stringify({ error: { key: 'k', message: 'No project' } })); process.exit(1);`,
    );
    expect(await runCodeQuest({ node: process.execPath, cli, home: 'x', args: ['state'], cwd: process.cwd() })).toEqual(
      { ok: false, message: 'No project' },
    );
  });

  it('never rejects: a missing node, a crash and a timeout become messages', async () => {
    const missing = await runCodeQuest({
      node: 'D:/no/such/node.exe',
      cli: 'x',
      home: 'x',
      args: [],
      cwd: process.cwd(),
    });
    expect(missing.ok).toBe(false);
    const crash = await fakeCli(`throw new Error('boom');`);
    const crashed = await runCodeQuest({
      node: process.execPath,
      cli: crash,
      home: 'x',
      args: ['state'],
      cwd: process.cwd(),
    });
    expect(crashed.ok).toBe(false);
    const slow = await fakeCli(`setTimeout(() => console.log(${JSON.stringify(doc)}), 5000);`);
    const timedOut = await runCodeQuest({
      node: process.execPath,
      cli: slow,
      home: 'x',
      args: ['state'],
      cwd: process.cwd(),
      timeoutMs: 300,
    });
    expect(timedOut.ok).toBe(false);
    if (!timedOut.ok) expect(timedOut.message).toMatch(/timed out/i);
  });
});
