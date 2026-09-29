#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../server/create-server.js';

const USAGE = 'Usage: codequest mcp';

async function main(argv: string[]): Promise<void> {
  const [command] = argv;
  if (command === 'mcp') {
    // stdout belongs to the MCP protocol; anything diagnostic goes to stderr.
    await createServer({ cwd: process.cwd() }).connect(new StdioServerTransport());
    return;
  }
  process.stderr.write(`${USAGE}\n`);
  process.exitCode = 1;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`codequest: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
