#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../server/create-server.js';
import { readLanguage } from '../storage/config.js';
import { resolveHome } from '../storage/paths.js';
import { runBoard } from './board.js';
import { homeFromArgv, homeOf, makeEngine, parse, runCli, usage } from './run.js';

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (command === 'mcp') {
    const home = rest.indexOf('--home');
    // stdout belongs to the MCP protocol; anything diagnostic goes to stderr.
    await createServer({
      cwd: process.cwd(),
      home: resolveHome(home >= 0 && rest[home + 1] !== undefined ? { home: rest[home + 1] as string } : {}),
    }).connect(new StdioServerTransport());
    return;
  }
  // The live board needs a real terminal; piped or redirected, `board` falls through to the plain text of runCli.
  if (command === 'board' && process.stdin.isTTY && process.stdout.isTTY) {
    process.exitCode = await runLiveBoard(rest);
    return;
  }
  if (command === undefined) {
    process.stderr.write(`${usage(await readLanguage(homeOf(null, process.env)))}\n`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = await runCli(argv, {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    cwd: process.cwd(),
    env: process.env,
  });
}

async function runLiveBoard(args: string[]): Promise<number> {
  const parsed = parse(args);
  if (typeof parsed === 'string') {
    const text = usage(await readLanguage(homeFromArgv(args, process.env)));
    process.stderr.write(`codequest: ${parsed}\n${text}\n`);
    return 1;
  }
  const io = {
    stdout: (text: string) => process.stdout.write(text),
    stderr: (text: string) => process.stderr.write(text),
    cwd: process.cwd(),
    env: process.env,
  };
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();
  try {
    await runBoard(
      makeEngine(parsed, io),
      parsed.path === undefined ? {} : { projectPath: parsed.path },
      {
        write: io.stdout,
        get columns() {
          return process.stdout.columns ?? 80;
        },
        get rows() {
          return process.stdout.rows ?? 24;
        },
        color: process.env.NO_COLOR === undefined,
        onInput(handler) {
          stdin.on('data', handler);
          return () => stdin.off('data', handler);
        },
      },
      { intervalMs: 30_000 },
    );
    return 0;
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`codequest: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
