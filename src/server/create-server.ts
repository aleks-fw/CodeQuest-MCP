import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetProjectState } from '../tools/get-project-state.js';
import { VERSION } from '../version.js';

export interface ServerOptions {
  /** Folder used when neither project_path nor client roots are given. */
  cwd: string;
}

export function createServer(options: ServerOptions): McpServer {
  const server = new McpServer({ name: 'codequest', version: VERSION });
  const context = { cwd: options.cwd, getRoots: () => clientRoots(server) };
  registerGetProjectState(server, context);
  return server;
}

async function clientRoots(server: McpServer): Promise<string[]> {
  if (!server.server.getClientCapabilities()?.roots) return [];
  try {
    const { roots } = await server.server.listRoots();
    return roots.filter((root) => root.uri.startsWith('file:')).map((root) => fileURLToPath(root.uri));
  } catch {
    // A client that declares roots but fails to list them should not break the tool.
    return [];
  }
}
