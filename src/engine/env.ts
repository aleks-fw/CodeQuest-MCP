import type { runCommand } from '../verification/commands.js';

/** Everything the engine needs from outside; tests replace the clock and the command runner. */
export interface EngineEnv {
  /** Data folder (CODEQUEST_HOME). */
  home: string;
  /** The server's working folder, the last fallback for the project path. */
  cwd: string;
  /** Folders reported by the MCP client, first one wins. Called only when needed. */
  getRoots?: () => Promise<string[]>;
  now: () => Date;
  /** Runs a project command; defaults to the real runner. */
  runCommand?: typeof runCommand;
}

export interface ProjectRequest {
  /** Explicit path from the caller; relative paths resolve against cwd. Blank/whitespace counts as absent. */
  projectPath?: string;
}
