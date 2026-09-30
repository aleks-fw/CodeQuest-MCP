import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { Engine, ProjectView } from '../engine/index.js';
import { levelProgress } from '../game/levels.js';
import {
  boardText,
  levelText,
  questText,
  refreshText,
  settingsText,
  stateText,
  statsText,
  verifyText,
} from '../hud/present.js';
import { shortId } from '../hud/quests.js';
import { LANGUAGE_NAMES, t } from '../i18n/index.js';
import type { Quest } from '../types.js';
import { toolError } from './errors.js';

const PROJECT_PATH = z
  .string()
  .optional()
  .describe('Project folder. Defaults to the first client root, then the server folder.');

const summary = (quest: Quest) => ({
  id: quest.id,
  number: shortId(quest),
  title: quest.title,
  difficulty: quest.difficulty,
  category: quest.category,
  status: quest.status,
  tasks: quest.subtasks?.map((task) => task.title) ?? [],
});

/** The data every tool returns next to its text. */
function dataOf(view: ProjectView): Record<string, unknown> {
  const progress = levelProgress(view.state.xp);
  return {
    project: { ...view.project },
    level: progress.level,
    title: progress.title,
    xp: view.state.xp,
    xpToNext: progress.xpToNext,
    stats: { ...view.state.stats },
    quests: view.state.quests.filter((quest) => quest.status === 'open').map(summary),
    busy: view.busy,
  };
}

/** Notifications not shown yet go on top of every answer (spec §9.6). */
async function answer(
  engine: Engine,
  view: ProjectView,
  body: string,
  extra: Record<string, unknown> = {},
): Promise<CallToolResult> {
  const notes = view.busy ? [] : await engine.notifications(view.project);
  const text = notes.length > 0 ? `${notes.join('\n')}\n\n${body}` : body;
  return {
    content: [{ type: 'text', text }],
    structuredContent: { ...dataOf(view), ...extra, notifications: notes },
  };
}

const READ_ONLY = { readOnlyHint: true } as const;

export function registerTools(server: McpServer, engine: Engine): void {
  server.registerTool(
    'get_project_state',
    {
      title: 'Get project state',
      description:
        'Show the CodeQuest campaign of a project: level, title, XP, stats, project type, hot files and the top of the quest board.',
      inputSchema: { project_path: PROJECT_PATH },
      annotations: READ_ONLY,
    },
    async ({ project_path }) => {
      try {
        const view = await engine.view({ projectPath: project_path });
        return await answer(engine, view, stateText(view));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'get_project_stats',
    {
      title: 'Get project stats',
      description: 'Show the nine stats of a project and the main findings that pull them down.',
      inputSchema: { project_path: PROJECT_PATH },
      annotations: READ_ONLY,
    },
    async ({ project_path }) => {
      try {
        const view = await engine.view({ projectPath: project_path });
        return await answer(engine, view, statsText(view));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'get_player_level',
    {
      title: 'Get player level',
      description:
        'Show the level, XP to the next level and the reward multiplier of a project, and all projects of the profile.',
      inputSchema: { project_path: PROJECT_PATH },
      annotations: READ_ONLY,
    },
    async ({ project_path }) => {
      try {
        const view = await engine.view({ projectPath: project_path });
        const profile = await engine.profile();
        return await answer(engine, view, levelText(view, profile), {
          projects: profile.projects.map((project) => ({ name: project.name, level: project.level, xp: project.xp })),
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'get_active_quests',
    {
      title: 'Get active quests',
      description: 'Show the quest board: up to 8 open quests with difficulty, category and reward.',
      inputSchema: { project_path: PROJECT_PATH },
      annotations: READ_ONLY,
    },
    async ({ project_path }) => {
      try {
        const view = await engine.view({ projectPath: project_path });
        return await answer(engine, view, boardText(view));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'get_quest_details',
    {
      title: 'Get quest details',
      description:
        'Show one quest: its conditions with the last check result, and the files and lines behind it. The quest is given by number, unique number prefix or title.',
      inputSchema: {
        quest_id: z.string().describe('Quest number (5 characters), unique prefix, full id or title.'),
        project_path: PROJECT_PATH,
      },
      annotations: READ_ONLY,
    },
    async ({ quest_id, project_path }) => {
      try {
        const { view, quest } = await engine.quest({ projectPath: project_path }, quest_id);
        return await answer(engine, view, questText(view, quest), { quest: summary(quest) });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'verify_quest_completion',
    {
      title: 'Verify quest completion',
      description:
        'The "Check quest" button: check one quest (or all open ones) against the real project now, even if findings are still there. Gives XP only when every condition holds. May run the project\'s own test/lint/build commands if the user allowed them.',
      inputSchema: {
        quest_id: z.string().optional().describe('Quest to check; all open quests when omitted.'),
        project_path: PROJECT_PATH,
      },
    },
    async ({ quest_id, project_path }) => {
      try {
        const view = await engine.verify({ projectPath: project_path }, quest_id?.trim() ? quest_id : undefined);
        return await answer(engine, view, verifyText(view), {
          reports: view.reports.map((report) => ({
            quest: report.quest.title,
            outcome: report.verdict.outcome,
            xp: report.xp,
            checks: report.verdict.results.map((result) => ({ ok: result.ok, detail: result.detail })),
          })),
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'refresh_project_analysis',
    {
      title: 'Refresh project analysis',
      description: 'Analyse the project again without the cache and show what changed.',
      inputSchema: { project_path: PROJECT_PATH },
    },
    async ({ project_path }) => {
      try {
        const view = await engine.refresh({ projectPath: project_path }, true);
        return await answer(engine, view, refreshText(view));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'set_project_settings',
    {
      title: 'Set project settings',
      description:
        "Allow or forbid running the project's own test/lint/build commands, and set their timeout. ONLY call with allow_commands=true after the user has explicitly agreed in this conversation: the commands run real project code.",
      inputSchema: {
        allow_commands: z.boolean().optional().describe("true only with the user's explicit consent."),
        command_timeout_sec: z.number().optional().describe('Timeout of one command, 30 to 1800 seconds.'),
        project_path: PROJECT_PATH,
      },
    },
    async ({ allow_commands, command_timeout_sec, project_path }) => {
      try {
        const view = await engine.setSettings(
          { projectPath: project_path },
          {
            ...(allow_commands === undefined ? {} : { allowCommands: allow_commands }),
            ...(command_timeout_sec === undefined ? {} : { commandTimeoutSec: command_timeout_sec }),
          },
        );
        return await answer(engine, view, settingsText(view), {
          allowCommands: view.record.allowCommands,
          commandTimeoutSec: view.record.commandTimeoutSec,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'set_language',
    {
      title: 'Set language',
      description:
        'Switch the language of the CodeQuest screens and reports (HUD, quest board, checks, notifications, level titles) to Russian (ru) or English (en), or show the current one when called without arguments. Check reasons, finding details (the "Where:" lines) and error messages may stay in English for now. Call it when the user asks to switch the language of CodeQuest. The setting is global and applies at once.',
      annotations: { idempotentHint: true },
      inputSchema: { language: z.enum(['ru', 'en']).optional().describe('ru or en; omit to just read the setting.') },
    },
    async ({ language }) => {
      try {
        if (language !== undefined) await engine.setLanguage(language);
        const current = await engine.language();
        return {
          content: [{ type: 'text', text: t(current, 'lang.now', { name: LANGUAGE_NAMES[current], code: current }) }],
          structuredContent: { language: current },
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
