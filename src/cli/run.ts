import { Engine } from '../engine/index.js';
import { CodeQuestError } from '../errors.js';
import { boardText, hudText, refreshText, verifyText } from '../hud/present.js';
import { resolveHome } from '../storage/paths.js';

export const USAGE = [
  'Usage:',
  '  codequest mcp                              run the MCP server (stdio)',
  '  codequest refresh [--force] [--path P]     analyse the project and show what changed',
  '  codequest verify [quest] [--path P]        check one quest, or all open ones',
  '  codequest hud [--minimal] [--path P]       show the HUD',
  '  codequest board [--path P]                 the quest board: choose a quest, take it to work, check it (in a terminal)',
  'Every command accepts --home H (data folder; default CODEQUEST_HOME, then ~/.codequest).',
].join('\n');

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  cwd: string;
  env: NodeJS.ProcessEnv;
  now?: () => Date;
}

export interface Parsed {
  positional: string[];
  path?: string;
  home?: string;
  force: boolean;
  minimal: boolean;
}

export function parse(args: string[]): Parsed | string {
  const parsed: Parsed = { positional: [], force: false, minimal: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? '';
    if (arg === '--force') parsed.force = true;
    else if (arg === '--minimal') parsed.minimal = true;
    else if (arg === '--path' || arg === '--home') {
      const value = args[++index];
      if (value === undefined || value.startsWith('--')) return `${arg} needs a value`;
      if (arg === '--path') parsed.path = value;
      else parsed.home = value;
    } else if (arg.startsWith('--')) return `Unknown option ${arg}`;
    else parsed.positional.push(arg);
  }
  return parsed;
}

export function makeEngine(parsed: Parsed, io: CliIo): Engine {
  return new Engine({
    home: resolveHome({ ...(parsed.home === undefined ? {} : { home: parsed.home }), env: io.env }),
    cwd: io.cwd,
    now: io.now ?? (() => new Date()),
  });
}

/** `refresh`, `verify`, `hud` and `board` as text; `mcp` and the live `board` need the process's stdio and live in index.ts. Returns the exit code (spec §9.5). */
export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const [command, ...rest] = argv;
  if (command !== 'refresh' && command !== 'verify' && command !== 'hud' && command !== 'board') {
    io.stderr(`${USAGE}\n`);
    return 1;
  }
  const parsed = parse(rest);
  if (typeof parsed === 'string') {
    io.stderr(`codequest: ${parsed}\n${USAGE}\n`);
    return 1;
  }
  const engine = makeEngine(parsed, io);
  const request = parsed.path === undefined ? {} : { projectPath: parsed.path };
  try {
    if (command === 'refresh') io.stdout(`${refreshText(await engine.refresh(request, parsed.force))}\n`);
    else if (command === 'verify') io.stdout(`${verifyText(await engine.verify(request, parsed.positional[0]))}\n`);
    else if (command === 'board') {
      const view = await engine.view(request);
      io.stdout(`${hudText(view)}\n\n${boardText(view)}\n`);
    } else io.stdout(`${hudText(await engine.view(request), parsed.minimal)}\n`);
    return 0;
  } catch (error) {
    io.stderr(`codequest: ${error instanceof CodeQuestError ? error.message : `Unexpected error: ${String(error)}`}\n`);
    return 1;
  }
}
