import { rm } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import type { CommandRun } from '../../src/types.js';
import type { RunOptions, RunOutcome } from '../../src/verification/commands.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

const outcome = (options: RunOptions, ok: boolean): RunOutcome => {
  const run: CommandRun = {
    ok,
    exitCode: ok ? 0 : 1,
    durationMs: 1000,
    changeKey: options.changeKey,
    at: options.now().toISOString(),
    tail: ok ? 'ok' : 'failed',
  };
  return { run };
};

async function shop(ok: boolean) {
  const root = await copyFixture('projects/nextjs-shop');
  const home = await makeTempDir();
  const engine = new Engine({
    home,
    cwd: root,
    now: () => new Date(),
    runCommand: async (options) => outcome(options, ok),
  });
  return { root, engine };
}

describe('the hint about XP waiting for a green run', () => {
  it('counts a quest that was completed in this very cycle', async () => {
    const { root, engine } = await shop(true);
    await engine.view({});
    await engine.setSettings({}, { allowCommands: true });
    await rm(path.join(root, 'components', 'ProductBadge.tsx'));
    const view = await engine.refresh({}, true);
    expect(view.state.xp).toBe(80);
    expect(view.owed).toEqual({ count: 1, xp: 20 });
  });

  it('is not shown when the commands already ran red on this state of the code: V would run nothing', async () => {
    const { root, engine } = await shop(false);
    await engine.view({});
    await engine.setSettings({}, { allowCommands: true });
    await rm(path.join(root, 'components', 'ProductBadge.tsx'));
    expect((await engine.refresh({}, true)).owed).toEqual({ count: 1, xp: 20 });
    const checked = await engine.verify({}, 'Optimize Images');
    expect(checked.state.xp).toBe(80);
    expect(checked.owed).toEqual({ count: 0, xp: 0 });
    expect((await engine.view({})).owed).toEqual({ count: 0, xp: 0 });
    // The code changes: a new run is possible again, so the hint comes back.
    await rm(path.join(root, 'components', 'Hero.tsx'), { force: true });
    await rm(path.join(root, 'README.md'), { force: true });
    expect((await engine.refresh({}, true)).owed).toEqual({ count: 1, xp: 20 });
  });
});
