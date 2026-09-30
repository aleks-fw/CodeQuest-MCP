import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Engine } from '../engine/index.js';
import { boardText, hudText, stateText } from '../hud/present.js';

const message = (text: string) => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] });

const QUEST = z.string().optional().describe('Quest number, prefix or title.');

/** The prompts of the `/` menu (spec §9.3): each one is an instruction for the assistant, not a computation. */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'verify_quest',
    {
      title: 'Check quest',
      description: 'Check a quest (or all open ones) against the project and show the ✓/✗ report.',
      argsSchema: { quest: QUEST },
    },
    ({ quest }) =>
      message(
        `Call the CodeQuest tool verify_quest_completion${quest ? ` with quest_id "${quest}"` : ' without quest_id (all open quests)'}. ` +
          'Then show the user the report as it is (which conditions are ✓ and which ✗, XP, level up) in the language the user writes in. ' +
          'Do not claim the quest is done unless the tool result structuredContent reports[].outcome is `completed` ' +
          '(report line `Result: COMPLETE` / `Итог: ВЫПОЛНЕНО`).',
      ),
  );
  server.registerPrompt(
    'quest_board',
    {
      title: 'Quest board',
      description: 'Show the HUD and the quest board, and advise which quest to take first.',
    },
    () =>
      message(
        'Call the CodeQuest tools get_project_state and get_active_quests. Show the HUD and the board, then in the language the user writes in ' +
          'recommend one quest to start with and say why (reward, effort, what it fixes). Keep it short.',
      ),
  );
  server.registerPrompt(
    'work_on_quest',
    {
      title: 'Work on quest',
      description: 'Read a quest, do the work in the code, then check it.',
      argsSchema: { quest: z.string().describe('Quest number, prefix or title.') },
    },
    ({ quest }) =>
      message(
        `Call start_quest with quest_id "${quest}" so the board shows it as in progress, then call get_quest_details with the same quest_id and read the conditions and the files. Do the work in the project ` +
          'so that every condition can become ✓. Do not edit test/lint/build scripts and do not add suppression comments to hide ' +
          `problems: CodeQuest notices both. When done, call verify_quest_completion with quest_id "${quest}" and report the result in the language the user writes in.`,
      ),
  );
}

/** The resources of spec §9.4 for the current project. */
export function registerResources(server: McpServer, engine: Engine): void {
  const text = (name: string, uri: string, description: string, build: () => Promise<string>) =>
    server.registerResource(name, uri, { description, mimeType: 'text/plain' }, async (url) => ({
      contents: [{ uri: url.href, mimeType: 'text/plain', text: await build() }],
    }));
  text('hud', 'codequest://hud', 'HUD of the current project', async () => hudText(await engine.view({})));
  text('quests', 'codequest://quests', 'Quest board of the current project', async () =>
    boardText(await engine.view({})),
  );
  server.registerResource(
    'state',
    'codequest://state',
    { description: 'State of the current project (JSON)', mimeType: 'application/json' },
    async (url) => {
      const view = await engine.view({});
      const body = {
        project: view.project,
        level: view.state.level,
        xp: view.state.xp,
        stats: view.state.stats,
        quests: view.state.quests.filter((quest) => quest.status === 'open'),
        summary: stateText(view),
      };
      return { contents: [{ uri: url.href, mimeType: 'application/json', text: JSON.stringify(body, null, 2) }] };
    },
  );
}
