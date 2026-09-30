import os from 'node:os';
import path from 'node:path';

export const SCHEMA = 1 as const;

export interface HomeOptions {
  /** --home of the CLI; wins over the environment. */
  home?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Data folder: --home, then CODEQUEST_HOME, then ~/.codequest (spec §5). The default sits on the system drive, so the
 * user's setup always sets CODEQUEST_HOME.
 */
export function resolveHome(options: HomeOptions = {}): string {
  const env = options.env ?? process.env;
  const chosen = options.home ?? env.CODEQUEST_HOME;
  return path.resolve(chosen !== undefined && chosen !== '' ? chosen : path.join(os.homedir(), '.codequest'));
}

export const configFile = (home: string): string => path.join(home, 'config.json');
export const profileFile = (home: string): string => path.join(home, 'profile.json');
export const projectsDir = (home: string): string => path.join(home, 'projects');
export const projectDir = (home: string, id: string): string => path.join(projectsDir(home), id);

export const PROJECT_FILES = {
  record: 'project.json',
  snapshot: 'snapshot.json',
  state: 'state.json',
  events: 'events.jsonl',
} as const;
