#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../server/create-server.js';
import { resolveHome } from '../storage/paths.js';
import { runCli, USAGE } from './run.js';

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
  if (command === undefined) {
    process.stderr.write(`${USAGE}\n`);
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

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`codequest: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
