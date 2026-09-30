import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Engine, type ProjectView } from '../../src/engine/index.js';
import { readEvents, sumXp } from '../../src/storage/journal.js';
import type { CommandRun } from '../../src/types.js';
import type { RunOptions, RunOutcome } from '../../src/verification/commands.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

let clock = Date.parse('2026-09-30T12:00:00.000Z');
const now = (): Date => {
  clock += 1000;
  return new Date(clock);
};

async function shop(runCommand?: (options: RunOptions) => Promise<RunOutcome>) {
  const root = await copyFixture('projects/nextjs-shop');
  const home = await makeTempDir();
  const engine = new Engine({ home, cwd: root, now, ...(runCommand === undefined ? {} : { runCommand }) });
  return { root, home, engine };
}

const titles = (view: ProjectView) =>
  view.state.quests.filter((quest) => quest.status === 'open').map((quest) => quest.title);
const types = (view: ProjectView) => view.events.map((event) => event.type);

function green(options: RunOptions): RunOutcome {
  const run: CommandRun = {
    ok: true,
    exitCode: 0,
    durationMs: 1200,
    changeKey: options.changeKey,
    at: options.now().toISOString(),
    tail: 'ok',
  };
  return { run };
}

describe('first look at a project', () => {
  it('builds the board of spec §7.7, opens its quests in the journal and caches the analysis', async () => {
    const { engine, home } = await shop();
    const view = await engine.view({});
    expect(view.busy).toBe(false);
    expect(titles(view).sort()).toEqual(
      ['Checkout Master', 'Clean Inventory', 'Clean Up TODOs', 'Optimize Images'].sort(),
    );
    expect(view.state).toMatchObject({ xp: 0, level: 1 });
    expect(types(view).filter((type) => type === 'quest_opened')).toHaveLength(4);
    expect(types(view)).toContain('analysis');

    const again = await engine.view({});
    expect(again.events).toEqual([]);
    expect(titles(again).sort()).toEqual(titles(view).sort());
    const journal = await readEvents(path.join(home, 'projects', view.project.id, 'events.jsonl'));
    expect(journal.events).toHaveLength(view.events.length);
  });

  it('remembers the project for the poller and lists it in the profile', async () => {
    const { engine } = await shop();
    expect(engine.lastProject).toBeNull();
    const view = await engine.view({});
    expect(engine.lastProject?.id).toBe(view.project.id);
    const profile = await engine.profile();
    expect(profile.projects.map((project) => project.id)).toEqual([view.project.id]);
  });
});

describe('the full cycle', () => {
  it('a deleted unused component completes Clean Inventory: 80 XP without commands, paid once', async () => {
    const { engine, root, home } = await shop();
    const first = await engine.view({});
    await rm(path.join(root, 'components', 'ProductBadge.tsx'));

    const view = await engine.poll();
    expect(view).not.toBeNull();
    const done = view?.state.quests.find((quest) => quest.title === 'Clean Inventory');
    expect(done).toMatchObject({ status: 'completed', xpAwarded: 80 });
    expect(view?.state.xp).toBe(80);
    expect(view?.events.map((event) => event.type)).toEqual(expect.arrayContaining(['quest_completed', 'xp']));
    expect(view?.state.paidFindings).toHaveLength(1);

    const journal = await readEvents(path.join(home, 'projects', first.project.id, 'events.jsonl'));
    expect(sumXp(journal.events)).toBe(80);
    const after = await engine.view({});
    expect(after.state.xp).toBe(80);
    expect(titles(after)).not.toContain('Clean Inventory');
  });

  it('the 20 XP a quest missed without commands are paid once when the commands run green, and not before', async () => {
    const { engine, root, home } = await shop(async (options) => green(options));
    const first = await engine.view({});
    await rm(path.join(root, 'components', 'ProductBadge.tsx'));
    expect((await engine.poll())?.state.xp).toBe(80);

    // Commands are still forbidden: nothing more is paid, however often the project is looked at.
    expect((await engine.refresh({}, true)).state.xp).toBe(80);

    await engine.setSettings({}, { allowCommands: true });
    const paid = await engine.refresh({}, true);
    expect(paid.state.xp).toBe(100);
    // A green run is not a bug, even though it reports no number of failed tests.
    expect(paid.state.stats.bugs).toBe(0);
    expect((await engine.refresh({}, true)).state.xp).toBe(100);
    const journal = await readEvents(path.join(home, 'projects', first.project.id, 'events.jsonl'));
    expect(sumXp(journal.events)).toBe(100);
    const topUps = journal.events.filter((event) => event.type === 'xp' && event.data.topUp !== undefined);
    expect(topUps).toHaveLength(1);
    expect(topUps[0]?.data).toMatchObject({ amount: 20, factor: 1 });
    expect((await engine.view({})).state.xp).toBe(100);
  });

  it('a red run pays nothing more', async () => {
    const red = async (options: RunOptions): Promise<RunOutcome> => {
      const outcome = green(options);
      return 'run' in outcome ? { run: { ...outcome.run, ok: false, exitCode: 1 } } : outcome;
    };
    const { engine, root } = await shop(red);
    await engine.view({});
    await rm(path.join(root, 'components', 'ProductBadge.tsx'));
    expect((await engine.poll())?.state.xp).toBe(80);
    await engine.setSettings({}, { allowCommands: true });
    expect((await engine.refresh({}, true)).state.xp).toBe(80);
  });

  it('"done" without changes gives 0 XP: the quest stays open and the failure is journaled', async () => {
    const { engine } = await shop();
    await engine.view({});
    const view = await engine.verify({}, 'Clean Inventory');
    expect(view.state.xp).toBe(0);
    expect(view.reports).toHaveLength(1);
    expect(view.reports[0]?.verdict.outcome).toBe('open');
    expect(view.reports[0]?.xp).toBe(0);
    expect(types(view)).toContain('verification_failed');
    expect(titles(view)).toContain('Clean Inventory');
    expect(view.state.quests.find((quest) => quest.title === 'Clean Inventory')?.lastCheck?.some((r) => !r.ok)).toBe(
      true,
    );
  });

  it('rejects an unknown quest with a readable error', async () => {
    const { engine } = await shop();
    await engine.view({});
    await expect(engine.verify({}, 'no-such-quest')).rejects.toThrow('No quest "no-such-quest"');
  });

  it('a subtask whose module is deleted becomes obsolete, the epic stays open', async () => {
    const { engine, root } = await shop();
    await engine.view({});
    await rm(path.join(root, 'lib', 'cart.ts'));
    const view = await engine.poll();
    const epic = view?.state.quests.find((quest) => quest.title === 'Checkout Master');
    expect(epic?.status).toBe('open');
    expect(epic?.subtasks?.find((task) => task.title === 'Protect Cart')?.status).toBe('obsolete');
    expect(view?.events.map((event) => event.type)).toContain('quest_obsolete');
    // Cart.ts also held a TODO, so Clean Up TODOs is honestly done; the epic and its subtasks pay nothing.
    expect(epic?.xpAwarded).toBeUndefined();
  });

  it('a paid finding that comes back is journaled as finding_returned', async () => {
    const { engine, root } = await shop();
    await engine.view({});
    const badge = path.join(root, 'components', 'ProductBadge.tsx');
    const text = await readFile(badge, 'utf8');
    await rm(badge);
    await engine.poll();
    await writeFile(badge, text);
    const view = await engine.poll();
    expect(view?.events.map((event) => event.type)).toContain('finding_returned');
  });
});

describe('project commands', () => {
  it('do not run until the user allows them; then run once per change key and give the full reward', async () => {
    const calls: string[] = [];
    const { engine, root } = await shop(async (options) => {
      calls.push(options.command);
      return green(options);
    });
    await engine.view({});
    await rm(path.join(root, 'components', 'ProductBadge.tsx'));
    await engine.poll();
    expect(calls).toEqual([]);

    // A second copy of the shop, with commands allowed from the start.
    const other = await shop(async (options) => {
      calls.push(options.command);
      return green(options);
    });
    await other.engine.view({});
    const settings = await other.engine.setSettings({}, { allowCommands: true, commandTimeoutSec: 90 });
    expect(settings.record).toMatchObject({ allowCommands: true, commandTimeoutSec: 90 });
    expect(types(settings)).not.toContain('quest_completed');
    await rm(path.join(other.root, 'components', 'ProductBadge.tsx'));
    const view = await other.engine.poll();
    expect(view?.state.quests.find((quest) => quest.title === 'Clean Inventory')).toMatchObject({
      status: 'completed',
      xpAwarded: 100,
    });
    // The quest was opened before commands were allowed, so it has no build condition (starred conditions are fixed at
    // creation); tests run for no_regressions.
    expect(calls).toEqual(['npm test']);
    expect(view?.state.lastRuns.test?.ok).toBe(true);
  });

  it('keeps the timeout between 30 and 1800 seconds', async () => {
    const { engine } = await shop();
    const view = await engine.setSettings({}, { commandTimeoutSec: 5 });
    expect(view.record.commandTimeoutSec).toBe(30);
  });

  it('a red test run becomes a Fix Failing Tests quest', async () => {
    const { engine } = await shop(async (options) => ({
      run: { ok: false, exitCode: 1, failedTests: 2, durationMs: 10, changeKey: options.changeKey, at: '', tail: 'x' },
    }));
    await engine.view({});
    await engine.setSettings({}, { allowCommands: true });
    // Something must be due for the commands to run: an explicit check of the board runs them.
    const view = await engine.verify({});
    expect(view.state.lastRuns.test?.ok).toBe(false);
    expect(view.snapshot?.findings.some((finding) => finding.rule === 'generic/failing-tests')).toBe(true);
    const next = await engine.refresh({}, true);
    expect(titles(next)).toContain('Fix Failing Tests');
  });
});
