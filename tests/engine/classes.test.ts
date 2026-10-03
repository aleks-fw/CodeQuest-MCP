import { afterAll, describe, expect, it } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { hudText, stateText, statsText } from '../../src/hud/present.js';
import { appendEvents } from '../../src/storage/journal.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

async function shop() {
  const root = await copyFixture('projects/nextjs-shop');
  const home = await makeTempDir();
  return new Engine({ home, cwd: root, now: () => new Date() });
}

const completed = (category: string, difficulty: string, id: string) => ({
  at: new Date().toISOString(),
  type: 'quest_completed' as const,
  data: { id, category, difficulty, xp: 10 },
});

describe('the class in the view', () => {
  it('a new project has no class and its texts are as before', async () => {
    const engine = await shop();
    const view = await engine.view({});
    expect(view.playerClass).toBeNull();
    expect(hudText(view)).not.toContain('★');
    expect(stateText(view)).not.toContain('Class:');
  });

  it('shows the class once enough quests are completed, the same on the cached and the full path', async () => {
    const engine = await shop();
    const { project } = await engine.view({});
    await appendEvents(engine.storeOf(project).file('events'), [
      completed('testing', 'medium', 'a'),
      completed('testing', 'easy', 'b'),
    ]);
    expect((await engine.refresh({}, true)).playerClass).toBeNull();

    await appendEvents(engine.storeOf(project).file('events'), [completed('architecture', 'medium', 'c')]);
    const full = await engine.refresh({}, true);
    expect(full.playerClass).toMatchObject({ primary: 'tester', secondary: 'architect' });
    const cached = await engine.view({});
    expect(cached.playerClass).toEqual(full.playerClass);

    expect(hudText(cached).split('\n')[0]).toContain('· Test Architect');
    expect(statsText(cached)).toContain('Testing: ');
    expect(statsText(cached)).toContain('★');
    expect(stateText(cached)).toContain('Class: Test Architect (Tester 57% · Architect 43%)');
  });

  it('the class is worked out in the cycle that finds the quests', async () => {
    const engine = await shop();
    const { project } = await engine.view({});
    await appendEvents(engine.storeOf(project).file('events'), [
      completed('bug', 'easy', 'a'),
      completed('bug', 'easy', 'b'),
      completed('bug', 'easy', 'c'),
    ]);
    const view = await engine.refresh({}, true);
    expect(view.playerClass?.primary).toBe('bug-hunter');
  });
});
