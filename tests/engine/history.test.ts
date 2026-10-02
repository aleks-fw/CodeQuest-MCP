import { rm } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { historyText } from '../../src/hud/history.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

async function shop() {
  const root = await copyFixture('projects/nextjs-shop');
  const home = await makeTempDir();
  return { root, engine: new Engine({ home, cwd: root, now: () => new Date() }) };
}

describe('Engine.history', () => {
  it('tells about the quest a real cycle completed', async () => {
    const { root, engine } = await shop();
    await engine.view({});
    expect((await engine.history({}, 7)).days).toEqual([]);
    await rm(path.join(root, 'components', 'ProductBadge.tsx'));
    await engine.poll();
    const view = await engine.history({}, 7);
    expect(view).toMatchObject({ period: 7, lang: 'en' });
    expect(view.days).toHaveLength(1);
    expect(view.days[0]).toMatchObject({ xp: 80, quests: 1 });
    expect(historyText(view)).toContain('Clean Inventory');
    await engine.setLanguage('ru');
    expect(historyText(await engine.history({}, 7))).toContain('ИСТОРИЯ');
  });

  it('a project that was never looked at has an empty history, and days are clamped', async () => {
    const { engine } = await shop();
    const view = await engine.history({}, 9999);
    expect(view.period).toBe(365);
    expect(view.days).toEqual([]);
    expect((await engine.history({}, 0)).period).toBe(1);
    expect((await engine.history({})).period).toBe(14);
  });
});
