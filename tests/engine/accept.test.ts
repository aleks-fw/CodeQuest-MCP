import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { readEvents } from '../../src/storage/journal.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

async function setup() {
  const root = await copyFixture('projects/nextjs-shop');
  const home = await makeTempDir();
  const make = () => new Engine({ home, cwd: root, now: () => new Date('2026-09-30T12:00:00.000Z') });
  return { root, home, make };
}

describe('taking a quest to work', () => {
  it('marks the quest, writes it to the journal and keeps the mark over a restart and a new analysis', async () => {
    const { home, make } = await setup();
    const engine = make();
    const { quest, view } = await engine.accept({}, 'Clean Inventory');
    expect(quest.title).toBe('Clean Inventory');
    expect(quest.acceptedAt).toBe('2026-09-30T12:00:00.000Z');

    const restarted = await make().view({});
    expect(restarted.state.quests.find((item) => item.title === 'Clean Inventory')?.acceptedAt).toBeDefined();
    expect(restarted.state.quests.find((item) => item.title === 'Clean Up TODOs')?.acceptedAt).toBeUndefined();

    const forced = await make().refresh({}, true);
    expect(forced.state.quests.find((item) => item.title === 'Clean Inventory')?.acceptedAt).toBeDefined();

    const journal = await readEvents(path.join(home, 'projects', view.project.id, 'events.jsonl'));
    expect(journal.events.filter((event) => event.type === 'quest_accepted')).toHaveLength(1);
  });

  it('taking the same quest twice changes nothing and writes nothing more', async () => {
    const { home, make } = await setup();
    const engine = make();
    const first = await engine.accept({}, 'Clean Inventory');
    const again = await engine.accept({}, first.quest.id);
    expect(again.quest.acceptedAt).toBe(first.quest.acceptedAt);
    const journal = await readEvents(path.join(home, 'projects', first.view.project.id, 'events.jsonl'));
    expect(journal.events.filter((event) => event.type === 'quest_accepted')).toHaveLength(1);
  });

  it('an unknown quest is a readable error', async () => {
    const { make } = await setup();
    await expect(make().accept({}, 'No Such Quest')).rejects.toThrow('No quest');
  });

  it('cancelling a taken quest returns it to the open ones, keeps it on the board and journals it', async () => {
    const { home, make } = await setup();
    const engine = make();
    const taken = await engine.accept({}, 'Clean Inventory');
    const released = await engine.release({}, taken.quest.id);
    expect(released.quest.acceptedAt).toBeUndefined();
    const after = await make().view({});
    const found = after.state.quests.find((item) => item.id === taken.quest.id);
    expect(found?.status).toBe('open');
    expect(found?.acceptedAt).toBeUndefined();
    const journal = await readEvents(path.join(home, 'projects', taken.view.project.id, 'events.jsonl'));
    expect(journal.events.filter((event) => event.type === 'quest_released')).toHaveLength(1);
    // A quest that is not taken: nothing changes, nothing is written.
    await engine.release({}, taken.quest.id);
    const again = await readEvents(path.join(home, 'projects', taken.view.project.id, 'events.jsonl'));
    expect(again.events.filter((event) => event.type === 'quest_released')).toHaveLength(1);
  });
});
