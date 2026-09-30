import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Engine } from '../engine/index.js';
import { resolveHome } from '../storage/paths.js';
import { registerPrompts, registerResources } from '../tools/prompts.js';
import { registerTools } from '../tools/register.js';
import { VERSION } from '../version.js';

const ROOTS_TIMEOUT_MS = 3000;

export interface ServerOptions {
  /** Folder used when neither project_path nor client roots are given. */
  cwd: string;
  /** Data folder; defaults to CODEQUEST_HOME, then ~/.codequest (spec §5). */
  home?: string;
  now?: () => Date;
  /** Seconds between change checks of the last used project; 0 turns the poller off. Default: CODEQUEST_POLL_SECONDS, then 60. */
  pollSeconds?: number;
}

const DEFAULT_POLL_SECONDS = 60;

function resolvePollSeconds(option: number | undefined): number {
  if (option !== undefined) return option;
  const fromEnv = Number(process.env.CODEQUEST_POLL_SECONDS);
  return process.env.CODEQUEST_POLL_SECONDS !== undefined && Number.isFinite(fromEnv) && fromEnv >= 0
    ? fromEnv
    : DEFAULT_POLL_SECONDS;
}

export function createServer(options: ServerOptions): McpServer {
  const server = new McpServer({ name: 'codequest', version: VERSION });
  const engine = new Engine({
    home: options.home ?? resolveHome(),
    cwd: options.cwd,
    getRoots: () => clientRoots(server),
    now: options.now ?? (() => new Date()),
  });
  registerTools(server, engine);
  registerPrompts(server);
  registerResources(server, engine);
  startPoller(server, engine, resolvePollSeconds(options.pollSeconds));
  return server;
}

/** Spec §2.3: a cycle for the last used project every N seconds; it ends with the connection. */
function startPoller(server: McpServer, engine: Engine, seconds: number): void {
  if (seconds <= 0) return;
  const timer = setInterval(() => {
    // A failed background cycle must not touch the protocol; the next tool call reports real errors.
    engine.poll().catch(() => undefined);
  }, seconds * 1000);
  timer.unref();
  server.server.onclose = () => clearInterval(timer);
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
