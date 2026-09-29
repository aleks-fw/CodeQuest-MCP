import path from 'node:path';
import type { ProjectRef } from '../types.js';
import { resolveProject } from './project.js';

export interface ProjectRequest {
  /** Explicit path from the caller; relative paths resolve against cwd. */
  projectPath?: string;
  /** Folders reported by the MCP client, first one wins. */
  roots?: string[];
  /** The server's working folder, the last fallback. */
  cwd: string;
}

/** What get_project_state shows. Stage 9 adds level, XP, stats and quests. */
export interface ProjectStateView {
  project: ProjectRef;
}

export async function getProjectState(request: ProjectRequest): Promise<ProjectStateView> {
  const start = request.projectPath ?? request.roots?.[0] ?? request.cwd;
  const project = await resolveProject(path.resolve(request.cwd, start));
  return { project };
}
