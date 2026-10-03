import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, describe, expect, it } from 'vitest';
import { createServer } from '../../src/server/create-server.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

async function connect(options: { pollSeconds?: number } = {}) {
  const project = await copyFixture('projects/nextjs-shop');
  const home = await makeTempDir();
  const server = createServer({ cwd: project, home, pollSeconds: options.pollSeconds ?? 0 });
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })) as CallToolResult;
  return { project, client, call, home };
}

const text = (result: CallToolResult): string =>
  result.content.map((part) => (part.type === 'text' ? part.text : '')).join('\n');

describe('tools', () => {
  it('get_project_state shows the HUD, the project type and the board', async () => {
    const { call, project } = await connect();
    const result = await call('get_project_state');
    expect(result.isError).toBeFalsy();
    const body = text(result);
    expect(body).toContain('◆ LVL 1 · NEWCOMER');
    expect(body).toContain('Project type: shop');
    expect(body).toContain('QUEST BOARD');
    expect(body).toContain('Checkout Master');
    expect(result.structuredContent).toMatchObject({ level: 1, xp: 0, project: { root: path.resolve(project) } });
  });

  it('get_active_quests, get_project_stats and get_player_level answer', async () => {
    const { call } = await connect();
    expect(text(await call('get_active_quests'))).toContain('● Clean Inventory');
    expect(text(await call('get_project_stats'))).toContain('Testing:');
    const level = text(await call('get_player_level'));
    expect(level).toContain('500 XP to level 2');
    expect(level).toContain('Projects (each has its own XP)');
  });

  it('start_quest marks the quest as taken, and the board then shows it as in progress', async () => {
    const { call } = await connect();
    const first = await call('start_quest', { quest_id: 'Clean Inventory' });
    expect(first.isError).toBeFalsy();
    expect(text(first)).toContain('Taken to work: Clean Inventory');
    const again = await call('start_quest', { quest_id: 'Clean Inventory' });
    expect(again.isError).toBeFalsy();
    const board = await call('get_active_quests', {});
    expect(text(board)).toContain('IN PROGRESS');
  });

  it('get_project_history lists the milestones by day and clamps days', async () => {
    const { call, project } = await connect();
    await call('get_project_state');
    expect(text(await call('get_project_history'))).toContain('No milestones');

    await rm(path.join(project, 'components', 'ProductBadge.tsx'));
    await call('verify_quest_completion', { quest_id: 'Clean Inventory' });
    const result = await call('get_project_history', { days: 7 });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain('HISTORY');
    expect(text(result)).toContain('Clean Inventory · +80 XP');
    expect(result.structuredContent).toMatchObject({ period: 7, days: [{ xp: 80, quests: 1 }] });
    const lines = (result.structuredContent as { days: { lines: string[] }[] }).days[0]?.lines ?? [];
    expect(lines.some((line) => line.includes('Clean Inventory'))).toBe(true);

    const clamped = await call('get_project_history', { days: 0 });
    expect((clamped.structuredContent as { period: number }).period).toBe(1);
    const huge = await call('get_project_history', { days: 5000 });
    expect((huge.structuredContent as { period: number }).period).toBe(365);
  });

  it('get_achievements shows what was earned and the progress of the rest', async () => {
    const { call, project } = await connect();
    await call('get_project_state');
    const before = await call('get_achievements');
    expect(before.isError).toBeFalsy();
    expect(text(before)).toContain('ACHIEVEMENTS');
    expect(text(before)).toContain('0/12');
    expect(before.structuredContent).toMatchObject({ unlocked: 0, total: 12 });

    await rm(path.join(project, 'components', 'ProductBadge.tsx'));
    await call('verify_quest_completion', { quest_id: 'Clean Inventory' });
    const after = await call('get_achievements');
    expect(text(after)).toContain('1/12');
    expect(text(after)).toContain('★ First Step · Close your first quest.');
    expect(text(after)).toContain('□ Ten Down · Close 10 quests. · 1/10');
    const data = after.structuredContent as { unlocked: number; items: { id: string; unlockedAt?: string }[] };
    expect(data.unlocked).toBe(1);
    expect(data.items[0]).toMatchObject({ id: 'first-quest' });
    expect(data.items[0]?.unlockedAt).toBeDefined();
    expect(data.items).toHaveLength(12);
  });

  it('get_project_bosses shows a boss that a cluster of problems made, and says so when there is none', async () => {
    const quiet = await connect();
    const none = await quiet.call('get_project_bosses');
    expect(none.isError).toBeFalsy();
    expect(text(none)).toContain('No bosses');
    expect(none.structuredContent).toMatchObject({ active: [], defeated: [] });

    const { call, project } = await connect();
    for (let i = 1; i <= 5; i++) {
      await writeFile(path.join(project, 'components', `Dead${i}.tsx`), `export const Dead${i} = () => null;\n`);
    }
    const result = await call('get_project_bosses');
    expect(text(result)).toContain('BOSSES');
    expect(text(result)).toContain('◆ Graveyard · 6/6 HP (100%)');
    expect(result.structuredContent).toMatchObject({
      active: [{ id: 'graveyard', name: 'Graveyard', hp: 6, max: 6, percent: 100 }],
      defeated: [],
    });
  });

  it('get_quest_details finds a quest by title or number and shows the files', async () => {
    const { call } = await connect();
    const byTitle = await call('get_quest_details', { quest_id: 'Clean Inventory' });
    expect(text(byTitle)).toContain('QUEST Clean Inventory');
    expect(text(byTitle)).toContain('ProductBadge.tsx');
    const number = (byTitle.structuredContent as { quest: { number: string } }).quest.number;
    const byNumber = await call('get_quest_details', { quest_id: number });
    expect(text(byNumber)).toContain('QUEST Clean Inventory');
    const missing = await call('get_quest_details', { quest_id: 'zzzzz' });
    expect(missing.isError).toBe(true);
    expect(text(missing)).toContain('No quest "zzzzz"');
  });

  it('verify_quest_completion reports ✗ first, then pays the quest and shows the notification once', async () => {
    const { call, project } = await connect();
    await call('get_project_state');
    const notDone = await call('verify_quest_completion', { quest_id: 'Clean Inventory' });
    expect(text(notDone)).toContain('Result: NOT DONE YET');

    await rm(path.join(project, 'components', 'ProductBadge.tsx'));
    const done = await call('verify_quest_completion', { quest_id: 'Clean Inventory' });
    expect(text(done)).toContain('Result: COMPLETE · +80 XP');
    expect(text(done)).toContain('✓ Clean Inventory complete · +80 XP');
    const again = await call('get_player_level');
    expect(text(again)).not.toContain('✓ Clean Inventory complete');
    expect(again.structuredContent).toMatchObject({ xp: 80 });
  });

  it('refresh_project_analysis and set_project_settings work; commands stay off until allowed', async () => {
    const { call } = await connect();
    expect(text(await call('refresh_project_analysis'))).toContain('findings.');
    const off = await call('set_project_settings', {});
    expect(text(off)).toContain('NOT allowed');
    const on = await call('set_project_settings', { allow_commands: true, command_timeout_sec: 60 });
    expect(text(on)).toContain('allowed (timeout 60s)');
    expect(text(on)).toContain('npm test');
    expect(on.structuredContent).toMatchObject({ allowCommands: true, commandTimeoutSec: 60 });
  });

  it('set_language shows and switches the language; the schema rejects others', async () => {
    const { call, client } = await connect();
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(13);
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['set_language', 'get_project_history', 'get_achievements', 'get_project_bosses']),
    );
    expect(text(await call('set_language'))).toBe('Language: English (en)');
    const ru = await call('set_language', { language: 'ru' });
    expect(text(ru)).toBe('Язык: Русский (ru)');
    expect(ru.structuredContent).toEqual({ language: 'ru' });
    expect(text(await call('get_player_level'))).toContain('УР.');
    let rejected = false;
    try {
      rejected = (await call('set_language', { language: 'de' })).isError === true;
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
    expect(text(await call('set_language', { language: 'en' }))).toBe('Language: English (en)');
    expect(text(await call('get_player_level'))).toContain('LVL');
  });
});

describe('prompts and resources', () => {
  it('has the three prompts, and each tells the assistant which tools to call', async () => {
    const { client } = await connect();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name).sort()).toEqual(['quest_board', 'verify_quest', 'work_on_quest']);
    const verify = await client.getPrompt({ name: 'verify_quest', arguments: { quest: 'abc12' } });
    const body = JSON.stringify(verify.messages);
    expect(body).toContain('verify_quest_completion');
    expect(body).toContain('abc12');
    const work = await client.getPrompt({ name: 'work_on_quest', arguments: { quest: 'abc12' } });
    expect(JSON.stringify(work.messages)).toContain('start_quest');
    expect(JSON.stringify(work.messages)).toContain('get_quest_details');
    const board = await client.getPrompt({ name: 'quest_board' });
    expect(JSON.stringify(board.messages)).toContain('get_active_quests');
    for (const message of [verify, work, board]) {
      const all = JSON.stringify(message.messages);
      expect(all).not.toContain('Russian');
      expect(all).toContain('language the user writes in');
    }
    expect(body).toContain('outcome is `completed`');
    expect(body).toContain('Итог: ВЫПОЛНЕНО');
    expect(body).not.toContain('says COMPLETE');
  });

  it('serves the HUD, the board and the state as resources', async () => {
    const { client } = await connect();
    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri).sort()).toEqual([
      'codequest://hud',
      'codequest://quests',
      'codequest://state',
    ]);
    const hud = await client.readResource({ uri: 'codequest://hud' });
    expect(JSON.stringify(hud.contents)).toContain('LVL 1');
    const quests = await client.readResource({ uri: 'codequest://quests' });
    expect(JSON.stringify(quests.contents)).toContain('QUEST BOARD');
    const state = await client.readResource({ uri: 'codequest://state' });
    const first = state.contents[0];
    expect(JSON.parse(first && 'text' in first ? first.text : '{}')).toMatchObject({ level: 1, xp: 0 });
  });
});

describe('auto check', () => {
  it('the poller notices a finished quest without any tool call', async () => {
    const { call, project, client } = await connect({ pollSeconds: 1 });
    await call('get_project_state');
    await rm(path.join(project, 'components', 'ProductBadge.tsx'));
    // The poll happens on its own; wait for it, then the next call already shows the reward.
    await new Promise((resolve) => setTimeout(resolve, 3500));
    const level = await call('get_player_level');
    expect(level.structuredContent).toMatchObject({ xp: 80 });
    await client.close();
  }, 30_000);
});
