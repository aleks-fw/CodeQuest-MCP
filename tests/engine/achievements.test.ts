import { copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { appendEvents, readEvents } from '../../src/storage/journal.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

async function shop() {
  const root = await copyFixture('projects/nextjs-shop');
  const home = await makeTempDir();
  return { root, engine: new Engine({ home, cwd: root, now: () => new Date() }) };
}

const unlockedIds = async (engine: Engine, project: Parameters<Engine['storeOf']>[0]): Promise<string[]> => {
  const { events } = await readEvents(engine.storeOf(project).file('events'));
  return events.filter((event) => event.type === 'achievement_unlocked').map((event) => String(event.data.id));
};

describe('achievements in the cycle', () => {
  it('a completed quest opens First Step once, and later cycles add nothing', async () => {
    const { root, engine } = await shop();
    const first = await engine.view({});
    expect(await unlockedIds(engine, first.project)).toEqual([]);

    await rm(path.join(root, 'components', 'ProductBadge.tsx'));
    const cycle = await engine.poll();
    const fresh = cycle?.events.filter((event) => event.type === 'achievement_unlocked') ?? [];
    expect(fresh.map((event) => event.data.id)).toEqual(['first-quest']);

    await engine.refresh({}, true);
    await engine.verify({});
    expect(await unlockedIds(engine, first.project)).toEqual(['first-quest']);
  });

  it('what was earned before the achievements existed opens at the first full cycle, in the order of the catalog', async () => {
    const { engine } = await shop();
    const { project } = await engine.view({});
    const at = new Date().toISOString();
    const completed = Array.from({ length: 10 }, () => ({
      at,
      type: 'quest_completed' as const,
      data: { xp: 10, category: 'bug' },
    }));
    await appendEvents(engine.storeOf(project).file('events'), [
      ...completed,
      { at, type: 'level_up', data: { from: 4, to: 5 } },
    ]);
    const view = await engine.refresh({}, true);
    expect(view.events.filter((event) => event.type === 'achievement_unlocked').map((event) => event.data.id)).toEqual([
      'first-quest',
      'quests-10',
      'level-5',
    ]);
    expect((await engine.refresh({}, true)).events.filter((event) => event.type === 'achievement_unlocked')).toEqual(
      [],
    );
  });
});

describe('closing the same quest twice', () => {
  it('does not count the second time: the problem came back and was fixed again', async () => {
    const { root, engine } = await shop();
    await engine.view({});
    const file = path.join(root, 'components', 'ProductBadge.tsx');
    const backup = path.join(root, 'ProductBadge.bak');
    await copyFile(file, backup);
    await rm(file);
    await engine.poll();
    await copyFile(backup, file);
    await rm(backup);
    await engine.refresh({}, true);
    await rm(file);
    await engine.refresh({}, true);
    const { project } = await engine.view({});
    const { events } = await readEvents(engine.storeOf(project).file('events'));
    expect(events.filter((event) => event.type === 'quest_completed').length).toBeGreaterThanOrEqual(2);
    const view = await engine.achievements({});
    expect(view.items.find((item) => item.id === 'quests-10')).toMatchObject({ value: 1, goal: 10 });
  });
});

describe('Engine.achievements', () => {
  it('lists the 11 achievements of the project with their progress and what was earned', async () => {
    const { root, engine } = await shop();
    await engine.view({});
    expect((await engine.achievements({})).items.every((item) => item.unlockedAt === undefined)).toBe(true);
    await rm(path.join(root, 'components', 'ProductBadge.tsx'));
    await engine.poll();
    const view = await engine.achievements({});
    expect(view.items).toHaveLength(11);
    expect(view.lang).toBe('en');
    expect(view.items.find((item) => item.id === 'first-quest')?.unlockedAt).toBeDefined();
    expect(view.items.find((item) => item.id === 'quests-10')).toMatchObject({ value: 1, goal: 10 });
  });

  it('a project that was never looked at has nothing earned', async () => {
    const { engine } = await shop();
    const view = await engine.achievements({});
    expect(view.items).toHaveLength(11);
    expect(view.items.every((item) => item.value === 0 && item.unlockedAt === undefined)).toBe(true);
  });
});
