import path from 'node:path';
import type { ProjectRef } from '../types.js';
import { resolveProject } from './project.js';

export interface ProjectRequest {
  /** Explicit path from the caller; relative paths resolve against cwd. Blank/whitespace counts as absent. */
  projectPath?: string;
  /** Lazily fetches folders reported by the MCP client, first one wins. Called only when needed. */
  getRoots?: () => Promise<string[]>;
  /** The server's working folder, the last fallback. */
  cwd: string;
}

/** What get_project_state shows. Stage 9 adds level, XP, stats and quests. */
export interface ProjectStateView {
  project: ProjectRef;
}

export async function getProjectState(request: ProjectRequest): Promise<ProjectStateView> {
  const projectPath = request.projectPath?.trim() ? request.projectPath : undefined;
  const start = projectPath ?? (await request.getRoots?.())?.[0] ?? request.cwd;
  const project = await resolveProject(path.resolve(request.cwd, start));
  return { project };
}
