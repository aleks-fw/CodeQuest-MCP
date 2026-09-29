import { exec, execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupTempDirs, makeGitProject } from '../helpers/temp-project.js';

const run = promisify(execFile);
const shell = promisify(exec);
const REPO = path.resolve(import.meta.dirname, '..', '..');
const CLI = path.join(REPO, 'dist', 'cli', 'index.js');

beforeAll(async () => {
  // Through the shell so npm.cmd resolves on Windows.
  await shell('npm run build', { cwd: REPO });
}, 120_000);

afterAll(cleanupTempDirs);

function stringEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

describe('codequest CLI', () => {
  it('serves MCP over stdio from the project folder', async () => {
    const project = await makeGitProject();
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI, 'mcp'],
      cwd: project,
      env: stringEnv(),
      stderr: 'pipe',
    });
    const client = new Client({ name: 'stdio-test', version: '0.0.0' });
    await client.connect(transport);
    try {
      const result = (await client.callTool({ name: 'get_project_state', arguments: {} })) as CallToolResult;
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({ project: { name: 'тест проект', root: path.resolve(project) } });
    } finally {
      await client.close();
    }
  });

  it('prints usage and exits with 1 without a command', async () => {
    const failure = await run(process.execPath, [CLI]).then(
      () => null,
      (error: { code?: number; stderr?: string }) => error,
    );
    expect(failure?.code).toBe(1);
    expect(failure?.stderr).toContain('Usage: codequest mcp');
  });
});
