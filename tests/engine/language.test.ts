import { afterAll, describe, expect, it } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { boardText, hudText, levelText, refreshText, settingsText, statsText } from '../../src/hud/present.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

describe('engine language', () => {
  it('a view carries the language; a switch made by another engine shows at the next request', async () => {
    const root = await copyFixture('projects/nextjs-shop');
    const home = await makeTempDir();
    const make = () => new Engine({ home, cwd: root, now: () => new Date() });
    const one = make();
    expect((await one.view({})).lang).toBe('en');
    await make().setLanguage('ru');
    expect(await one.language()).toBe('ru');
    expect((await one.view({})).lang).toBe('ru');
    expect((await one.verify({})).lang).toBe('ru');
    expect((await one.refresh({}, false)).lang).toBe('ru');
    await one.setLanguage('en');
    expect((await one.view({})).lang).toBe('en');
  });
});

it('the texts of a view follow its language', async () => {
  const root = await copyFixture('projects/nextjs-shop');
  const home = await makeTempDir();
  const engine = new Engine({ home, cwd: root, now: () => new Date() });
  await engine.setLanguage('ru');
  const view = await engine.view({});
  expect(hudText(view)).toContain('УР. 1 · НОВИЧОК');
  expect(boardText(view)).toContain('ДОСКА КВЕСТОВ');
  expect(statsText(view)).toContain('СТАТЫ');
  expect(levelText(view, await engine.profile())).toContain('До уровня 2 осталось 500 XP.');
  expect(settingsText(view)).toContain('НЕ разрешены');
  expect(refreshText(view)).toContain('Анализ');
  await engine.setLanguage('en');
  expect(boardText(await engine.view({}))).toContain('QUEST BOARD');
});
