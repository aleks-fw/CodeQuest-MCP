import { readFile, rm, stat, writeFile } from 'node:fs/promises';
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

describe('old quests are converted once even when the project did not change', () => {
  const setup = async () => {
    const root = await copyFixture('projects/nextjs-shop');
    const home = await makeTempDir();
    const engine = new Engine({ home, cwd: root, now: () => new Date() });
    await engine.setLanguage('ru');
    const view = await engine.view({});
    const dir = projectDir(home, view.project.id);
    const stateFile = path.join(dir, PROJECT_FILES.state);
    const strip = async (mutate?: (state: { quests: { vars?: unknown }[] }) => void) => {
      const state = JSON.parse(await readFile(stateFile, 'utf8'));
      delete state.textVarsVersion;
      for (const quest of state.quests) {
        delete quest.vars;
        for (const task of quest.subtasks ?? []) delete task.vars;
      }
      mutate?.(state);
      await writeFile(stateFile, JSON.stringify(state));
    };
    return { root, home, engine, dir, stateFile, strip };
  };
  const pause = () => new Promise((resolve) => setTimeout(resolve, 60));

  it('the next view (no refresh, no project change) restores vars, then stays cached', async () => {
    const { home, root, dir, stateFile, strip } = await setup();
    await strip();
    const stripped = JSON.parse(await readFile(stateFile, 'utf8'));
    expect(stripped.textVarsVersion).toBeUndefined();
    expect(stripped.quests.every((quest: { vars?: unknown }) => quest.vars === undefined)).toBe(true);
    const journalFile = path.join(dir, PROJECT_FILES.events);
    const journalBefore = await readFile(journalFile, 'utf8');
    const xpBefore = stripped.xp;
    const engine = new Engine({ home, cwd: root, now: () => new Date() });
    const view = await engine.view({});
    expect(view.state.xp).toBe(xpBefore);
    expect(await readFile(journalFile, 'utf8')).toBe(journalBefore);
    const open = view.state.quests.filter((quest) => quest.status === 'open');
    expect(open.length).toBeGreaterThan(0);
    for (const quest of open) {
      expect(quest.vars).toBeDefined();
      expect(questTitle(quest, 'ru')).not.toBe(quest.title);
      for (const task of quest.subtasks ?? []) expect(task.vars).toBeDefined();
    }
    expect(view.events.filter((event) => event.type === 'quest_opened')).toEqual([]);
    const snapshotFile = path.join(dir, PROJECT_FILES.snapshot);
    const before = (await stat(snapshotFile)).mtimeMs;
    await pause();
    await engine.view({});
    expect((await stat(snapshotFile)).mtimeMs).toBe(before);
  });

  it('a quest with no matching candidate gets vars from its English text; one that cannot be read stays without, the version is set and the next view is cached', async () => {
    const { home, root, dir, stateFile, strip } = await setup();
    await strip((state) => {
      const [first, second] = state.quests as Record<string, unknown>[];
      if (first) first.id = 'ffffffffffff';
      if (second) {
        second.id = 'eeeeeeeeeeee';
        second.description = 'unreadable';
      }
    });
    const stripped = JSON.parse(await readFile(stateFile, 'utf8'));
    expect(stripped.quests.every((quest: { vars?: unknown }) => quest.vars === undefined)).toBe(true);
    const engine = new Engine({ home, cwd: root, now: () => new Date() });
    await engine.view({});
    const saved = JSON.parse(await readFile(stateFile, 'utf8'));
    expect(saved.textVarsVersion).toBe(1);
    const byId = new Map(saved.quests.map((quest: { id: string; vars?: unknown }) => [quest.id, quest]));
    expect((byId.get('ffffffffffff') as { vars?: unknown }).vars).toBeDefined();
    expect((byId.get('eeeeeeeeeeee') as { vars?: unknown }).vars).toBeUndefined();
    const snapshotFile = path.join(dir, PROJECT_FILES.snapshot);
    const before = (await stat(snapshotFile)).mtimeMs;
    await pause();
    await engine.view({});
    expect((await stat(snapshotFile)).mtimeMs).toBe(before);
  });
});

describe('verify by title', () => {
  it('finds a quest by its Russian title, its English title and its number', async () => {
    const root = await copyFixture('projects/nextjs-shop');
    const home = await makeTempDir();
    const engine = new Engine({ home, cwd: root, now: () => new Date() });
    await engine.setLanguage('ru');
    const view = await engine.view({});
    const [first] = view.state.quests.filter((quest) => quest.status === 'open');
    if (first === undefined) throw new Error('no quest');
    for (const reference of [questTitle(first, 'ru'), first.title, first.id.slice(0, 5)]) {
      const result = await engine.verify({}, reference);
      expect(result.state.quests.some((quest) => quest.id === first.id)).toBe(true);
    }
  });
});

describe('old quests completed in the first cycle after the upgrade', () => {
  it('the quest_completed event carries template and vars', async () => {
    const root = await copyFixture('projects/nextjs-shop');
    const home = await makeTempDir();
    const engine = new Engine({ home, cwd: root, now: () => new Date() });
    await engine.setLanguage('ru');
    const view = await engine.view({});
    const stateFile = path.join(projectDir(home, view.project.id), PROJECT_FILES.state);
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    delete state.textVarsVersion;
    for (const quest of state.quests) {
      delete quest.vars;
      for (const task of quest.subtasks ?? []) delete task.vars;
    }
    await writeFile(stateFile, JSON.stringify(state));
    await rm(path.join(root, 'components', 'ProductBadge.tsx'));
    const next = await new Engine({ home, cwd: root, now: () => new Date() }).view({});
    const done = next.events.find((event) => event.type === 'quest_completed');
    expect(done?.data).toMatchObject({ template: 'clean-inventory', vars: { sk: 'file', sv: 'ProductBadge.tsx' } });
  });
});
