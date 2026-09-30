import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { questTitle } from '../../src/game/quests/text.js';
import { boardText, hudText, levelText, refreshText, settingsText, statsText } from '../../src/hud/present.js';
import { PROJECT_FILES, projectDir } from '../../src/storage/paths.js';
import type { Quest } from '../../src/types.js';
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
  expect(levelText(view, await engine.profile())).toContain('Новичок');
  expect(settingsText(view)).toContain('НЕ разрешены');
  expect(refreshText(view)).toContain('Анализ');
  await engine.setLanguage('en');
  expect(boardText(await engine.view({}))).toContain('QUEST BOARD');
});

it('a project view in ru shows Russian quest titles, and old quests get vars again at the next cycle', async () => {
  const root = await copyFixture('projects/nextjs-shop');
  const home = await makeTempDir();
  const engine = new Engine({ home, cwd: root, now: () => new Date() });
  await engine.setLanguage('ru');
  const view = await engine.view({});
  const open = view.state.quests.filter((quest) => quest.status === 'open');
  expect(open.length).toBeGreaterThan(0);
  for (const quest of open) {
    expect(quest.vars).toBeDefined();
    expect(questTitle(quest, 'ru')).not.toBe(quest.title);
    expect(questTitle(quest, 'en')).toBe(quest.title);
  }

  const file = path.join(projectDir(home, view.project.id), PROJECT_FILES.state);
  const state = JSON.parse(await readFile(file, 'utf8'));
  for (const quest of state.quests) {
    delete quest.vars;
    for (const task of quest.subtasks ?? []) delete task.vars;
  }
  await writeFile(file, JSON.stringify(state));
  const again = await new Engine({ home, cwd: root, now: () => new Date() }).refresh({}, true);
  const openAgain = again.state.quests.filter((quest) => quest.status === 'open');
  expect(openAgain.length).toBeGreaterThan(0);
  for (const quest of openAgain) {
    expect(quest.vars).toBeDefined();
    for (const task of quest.subtasks ?? []) expect(task.vars).toBeDefined();
  }
});

it('opened quests carry template and vars, and the refresh text lists them by their Russian titles', async () => {
  const root = await copyFixture('projects/nextjs-shop');
  const home = await makeTempDir();
  const engine = new Engine({ home, cwd: root, now: () => new Date() });
  await engine.setLanguage('ru');
  const view = await engine.refresh({}, false);
  const opened = view.events.filter((event) => event.type === 'quest_opened');
  expect(opened.length).toBeGreaterThan(0);
  for (const event of opened) {
    expect(typeof event.data.template).toBe('string');
    expect(event.data.title).toEqual(expect.any(String));
  }
  const first = opened[0];
  const quest = view.state.quests.find((item) => item.id === first?.data.id);
  expect(quest).toBeDefined();
  const text = refreshText(view);
  expect(text).toContain(questTitle(quest as Quest, 'ru'));
  expect(questTitle(quest as Quest, 'ru')).not.toBe(quest?.title);
});
