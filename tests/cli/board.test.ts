import { afterAll, describe, expect, it } from 'vitest';
import { type BoardTerminal, runBoard } from '../../src/cli/board.js';
import { Engine } from '../../src/engine/index.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

/** A terminal that records what is drawn and lets the test press keys. */
function fakeTerminal() {
  const screens: string[] = [];
  let handler: ((chunk: string) => void) | undefined;
  const term: BoardTerminal = {
    write: (text) => screens.push(text),
    columns: 100,
    color: false,
    onInput: (fn) => {
      handler = fn;
      return () => {
        handler = undefined;
      };
    },
  };
  const last = (): string => screens.at(-1) ?? '';
  const press = (chunk: string): void => handler?.(chunk);
  /** Waits until the screen shows the text (the engine works in the background). */
  const shows = async (text: string): Promise<void> => {
    for (let waited = 0; waited < 30_000 && !last().includes(text); waited += 100) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(last()).toContain(text);
  };
  return { term, press, shows, last };
}

describe('the interactive board', () => {
  it('shows the quests, opens a card, takes a quest to work, checks it and quits', async () => {
    const root = await copyFixture('projects/nextjs-shop');
    const engine = new Engine({ home: await makeTempDir(), cwd: root, now: () => new Date() });
    const { term, press, shows, last } = fakeTerminal();
    const done = runBoard(engine, {}, term, { intervalMs: 3_600_000 });

    await shows('Clean Inventory');
    expect(last()).toContain('LVL 1');
    expect(last()).not.toContain('IN PROGRESS');

    press('\r'); // open the card of the first quest
    await shows('Enter take it to work');
    press('\r'); // take it
    await shows('Taken to work');
    expect(last()).toContain('IN PROGRESS');

    press('v'); // check: nothing is done yet
    await shows('Not done yet');

    press('\u001b'); // back to the list: the quest is still marked
    await shows('↑↓ choose');
    expect(last()).toContain('IN PROGRESS');

    press('q');
    await done;
    const again = new Engine({ home: engine.env.home, cwd: root, now: () => new Date() });
    const restarted = await again.view({});
    expect(restarted.state.quests.filter((quest) => quest.acceptedAt !== undefined)).toHaveLength(1);
  }, 90_000);

  it('L switches the whole screen to Russian and back, and the setting is saved', async () => {
    const root = await copyFixture('projects/nextjs-shop');
    const home = await makeTempDir();
    const engine = new Engine({ home, cwd: root, now: () => new Date() });
    const { term, press, shows, last } = fakeTerminal();
    const done = runBoard(engine, {}, term, { intervalMs: 3_600_000 });
    await shows('Clean Inventory');
    press('l');
    await shows('УР. 1');
    await shows('↑↓ выбрать');
    expect(await engine.language()).toBe('ru');
    await shows('Чистка каталога');
    expect(last()).not.toContain('Clean Inventory');
    press('l');
    await shows('↑↓ choose');
    expect(await engine.language()).toBe('en');
    press('q');
    await done;
  }, 90_000);
});
