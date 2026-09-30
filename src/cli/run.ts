import { Engine } from '../engine/index.js';
import { CodeQuestError } from '../errors.js';
import { boardText, hudText, refreshText, verifyText } from '../hud/present.js';
import { isLang, LANGUAGE_NAMES, type Lang, t } from '../i18n/index.js';
import { readLanguage, writeLanguage } from '../storage/config.js';
import { resolveHome } from '../storage/paths.js';

const USAGE_KEYS = [
  'usage.header',
  'usage.mcp',
  'usage.refresh',
  'usage.verify',
  'usage.hud',
  'usage.board',
  'usage.lang',
  'usage.home',
] as const;

export function usage(lang: Lang): string {
  return USAGE_KEYS.map((key) => t(lang, key)).join('\n');
}

export const USAGE = usage('en');

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

/** The data folder of a parsed command line: --home, else CODEQUEST_HOME, else the default. */
export function homeOf(parsed: Pick<Parsed, 'home'> | null, env: NodeJS.ProcessEnv): string {
  return resolveHome({ ...(parsed?.home === undefined ? {} : { home: parsed.home }), env });
}

/** When parsing failed, still honour `--home <value>` so the usage speaks the saved language. */
export function homeFromArgv(argv: readonly string[], env: NodeJS.ProcessEnv): string {
  const at = argv.indexOf('--home');
  const value = at >= 0 ? argv[at + 1] : undefined;
  return homeOf(value === undefined || value.startsWith('--') ? null : { home: value }, env);
}

export function makeEngine(parsed: Parsed, io: CliIo): Engine {
  return new Engine({
    home: homeOf(parsed, io.env),
    cwd: io.cwd,
    now: io.now ?? (() => new Date()),
  });
}

async function runLang(parsed: Parsed, io: CliIo): Promise<number> {
  const home = homeOf(parsed, io.env);
  const value = parsed.positional[0]?.toLowerCase();
  let current = await readLanguage(home);
  if (value !== undefined) {
    if (!isLang(value)) {
      io.stderr(`${t(current, 'lang.bad', { value })}\n`);
      return 1;
    }
    await writeLanguage(home, value);
    current = value;
  }
  io.stdout(`${t(current, 'lang.now', { name: LANGUAGE_NAMES[current], code: current })}\n`);
  return 0;
}

/** `refresh`, `verify`, `hud` and `board` as text; `mcp` and the live `board` need the process's stdio and live in index.ts. Returns the exit code (spec §9.5). */
export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const [command, ...rest] = argv;
  const known = ['refresh', 'verify', 'hud', 'board', 'lang'];
  const parsed = command !== undefined && known.includes(command) ? parse(rest) : null;
  if (command === undefined || parsed === null || typeof parsed === 'string') {
    const text = usage(await readLanguage(homeFromArgv(argv, io.env)));
    io.stderr(typeof parsed === 'string' ? `codequest: ${parsed}\n${text}\n` : `${text}\n`);
    return 1;
  }
  if (command === 'lang') return runLang(parsed, io);
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
