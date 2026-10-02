import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { bossesText } from '../../src/hud/bosses.js';
import { readEvents } from '../../src/storage/journal.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

/** The shop has one unused file; five more reach the threshold of the Graveyard (6). */
async function graveyardShop(extra = 5) {
  const root = await copyFixture('projects/nextjs-shop');
  const dead: string[] = [path.join(root, 'components', 'ProductBadge.tsx')];
  for (let i = 1; i <= extra; i++) {
    const file = path.join(root, 'components', `Dead${i}.tsx`);
    await writeFile(file, `export const Dead${i} = () => null;\n`);
    dead.push(file);
  }
  const home = await makeTempDir();
  return { root, dead, engine: new Engine({ home, cwd: root, now: () => new Date() }) };
}

const bossTypes = async (engine: Engine, project: Parameters<Engine['storeOf']>[0]): Promise<string[]> => {
  const { events } = await readEvents(engine.storeOf(project).file('events'));
  return events
    .filter((event) => event.type === 'boss_spawned' || event.type === 'boss_defeated')
    .map((event) => `${event.type}:${String(event.data.id)}`);
};

describe('bosses in the cycle', () => {
  it('a project without a cluster of problems has no boss', async () => {
    const root = await copyFixture('projects/nextjs-shop');
    const engine = new Engine({ home: await makeTempDir(), cwd: root, now: () => new Date() });
    const view = await engine.view({});
    expect(await bossTypes(engine, view.project)).toEqual([]);
    expect(await engine.bosses({})).toMatchObject({ active: [], defeated: [] });
  });

  it('a cluster starts a fight once, and later cycles add nothing', async () => {
    const { engine } = await graveyardShop();
    const first = await engine.view({});
    expect(await bossTypes(engine, first.project)).toEqual(['boss_spawned:graveyard']);
    const board = await engine.bosses({});
    expect(board.active).toHaveLength(1);
    expect(board.active[0]).toMatchObject({ id: 'graveyard', hp: 6, max: 6 });
    expect(bossesText(board)).toContain('Graveyard · 6/6 HP (100%)');

    await engine.refresh({}, true);
    await engine.verify({});
    expect(await bossTypes(engine, first.project)).toEqual(['boss_spawned:graveyard']);
  });

  it('a project analysed before bosses existed gets its fight on the fast path', async () => {
    const { engine } = await graveyardShop();
    const first = await engine.view({});
    const file = engine.storeOf(first.project).file('events');
    const { events } = await readEvents(file);
    const old = events.filter((event) => !event.type.startsWith('boss_'));
    await writeFile(file, `${old.map((event) => JSON.stringify(event)).join('\n')}\n`);
    expect(await bossTypes(engine, first.project)).toEqual([]);
    await engine.view({});
    expect(await bossTypes(engine, first.project)).toEqual(['boss_spawned:graveyard']);
  });

  it('fixing the findings wins the fight and opens Boss Slayer; a new cluster starts a new fight', async () => {
    const { root, dead, engine } = await graveyardShop();
    const first = await engine.view({});
    for (const file of dead) await rm(file);
    const view = await engine.refresh({}, true);
    const types = view.events.map((event) => event.type);
    expect(types).toContain('boss_defeated');
    expect(
      view.events.filter((event) => event.type === 'achievement_unlocked').map((event) => event.data.id),
    ).toContain('boss-slayer');
    expect(await bossTypes(engine, first.project)).toEqual(['boss_spawned:graveyard', 'boss_defeated:graveyard']);
    const board = await engine.bosses({});
    expect(board.active).toEqual([]);
    expect(board.defeated.map((boss) => boss.id)).toEqual(['graveyard']);

    for (let i = 1; i <= 6; i++) {
      await writeFile(path.join(root, 'components', `Back${i}.tsx`), `export const B${i} = () => null;\n`);
    }
    await engine.refresh({}, true);
    expect(await bossTypes(engine, first.project)).toEqual([
      'boss_spawned:graveyard',
      'boss_defeated:graveyard',
      'boss_spawned:graveyard',
    ]);
    const achievements = await engine.achievements({});
    expect(achievements.items.find((item) => item.id === 'boss-slayer')?.value).toBe(1);
  });
});
