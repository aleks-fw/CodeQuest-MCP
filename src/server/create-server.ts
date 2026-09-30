import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Engine } from '../engine/index.js';
import { resolveHome } from '../storage/paths.js';
import { registerGetProjectState } from '../tools/get-project-state.js';
import { VERSION } from '../version.js';

const ROOTS_TIMEOUT_MS = 3000;

export interface ServerOptions {
  /** Folder used when neither project_path nor client roots are given. */
  cwd: string;
  /** Data folder; defaults to CODEQUEST_HOME, then ~/.codequest (spec §5). */
  home?: string;
  now?: () => Date;
}

export function createServer(options: ServerOptions): McpServer {
  const server = new McpServer({ name: 'codequest', version: VERSION });
  const engine = new Engine({
    home: options.home ?? resolveHome(),
    cwd: options.cwd,
    getRoots: () => clientRoots(server),
    now: options.now ?? (() => new Date()),
  });
  registerGetProjectState(server, engine);
  return server;
}

async function clientRoots(server: McpServer): Promise<string[]> {
  if (!server.server.getClientCapabilities()?.roots) return [];
  try {
    const { roots } = await server.server.listRoots(undefined, { timeout: ROOTS_TIMEOUT_MS });
    return roots.flatMap((root) => {
      if (!root.uri.startsWith('file:')) return [];
      try {
        return [fileURLToPath(root.uri)];
      } catch {
        // A malformed URI for one root should not drop the others.
        return [];
      }
    });
  } catch {
    // A client that declares roots but fails to list them should not break the tool.
    return [];
  }
}
