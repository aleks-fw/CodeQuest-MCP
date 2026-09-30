import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Engine } from '../engine/index.js';
import { formatProjectState } from '../hud/project.js';
import { toolError } from './errors.js';

export function registerGetProjectState(server: McpServer, engine: Engine): void {
  server.registerTool(
    'get_project_state',
    {
      title: 'Get project state',
      description: 'Show the CodeQuest campaign of a project: level, XP, stats and quests.',
      inputSchema: {
        project_path: z
          .string()
          .optional()
          .describe('Project folder. Defaults to the first client root, then the server folder.'),
      },
      outputSchema: {
        project: z.object({ id: z.string(), name: z.string(), root: z.string() }),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ project_path }) => {
      try {
        const view = await engine.view({ projectPath: project_path });
        return {
          content: [{ type: 'text', text: formatProjectState(view) }],
          structuredContent: { project: { ...view.project } },
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
