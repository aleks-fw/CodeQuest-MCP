import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { type CallToolResult, ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, describe, expect, it } from 'vitest';
import { createServer } from '../../src/server/create-server.js';
import { cleanupTempDirs, makeGitProject, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

interface ConnectOptions {
  cwd: string;
  /** Folders the client reports as roots; omit to declare no roots capability. */
  roots?: string[];
  /** Make roots/list fail although the capability is declared. */
  rootsFail?: boolean;
  /** Make roots/list hang forever (never resolve) although the capability is declared. */
  rootsHang?: boolean;
}

async function connect(options: ConnectOptions): Promise<Client> {
  const server = createServer({ cwd: options.cwd, home: await makeTempDir(), pollSeconds: 0 });
  const withRoots = options.roots !== undefined || options.rootsFail === true || options.rootsHang === true;
  const client = new Client(
    { name: 'test-client', version: '0.0.0' },
    { capabilities: withRoots ? { roots: {} } : {} },
  );
  if (withRoots) {
    client.setRequestHandler(ListRootsRequestSchema, async () => {
      if (options.rootsHang) return new Promise(() => {});
      if (options.rootsFail) throw new Error('roots unavailable');
      return { roots: (options.roots ?? []).map((root) => ({ uri: pathToFileURL(root).href })) };
    });
  }
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

async function callState(client: Client, args: Record<string, unknown> = {}): Promise<CallToolResult> {
  return (await client.callTool({ name: 'get_project_state', arguments: args })) as CallToolResult;
}

function textOf(result: CallToolResult): string {
  return result.content.map((part) => (part.type === 'text' ? part.text : '')).join('\n');
}

describe('MCP server', () => {
  it('lists the eight tools of spec §9.2', async () => {
    const client = await connect({ cwd: await makeTempDir() });
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'get_active_quests',
      'get_player_level',
      'get_project_state',
      'get_project_stats',
      'get_quest_details',
      'refresh_project_analysis',
      'set_project_settings',
      'verify_quest_completion',
    ]);
  });

  it('resolves project_path to its git root', async () => {
    const root = await makeGitProject({ 'src/app.ts': 'export {};\n' });
    const client = await connect({ cwd: await makeTempDir() });
    const result = await callState(client, { project_path: path.join(root, 'src') });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ project: { name: 'тест проект', root: path.resolve(root) } });
    expect(textOf(result)).toContain('тест проект');
  });

  it('falls back to the first client root', async () => {
    const root = await makeGitProject();
    const client = await connect({ cwd: await makeTempDir(), roots: [root] });
    const result = await callState(client);
    expect(result.structuredContent).toMatchObject({ project: { root: path.resolve(root) } });
  });

  it('falls back to the server folder without roots', async () => {
    const cwd = await makeGitProject();
    const client = await connect({ cwd });
    const result = await callState(client);
    expect(result.structuredContent).toMatchObject({ project: { root: path.resolve(cwd) } });
  });

  it('falls back to the server folder when roots/list fails', async () => {
    const cwd = await makeGitProject();
    const client = await connect({ cwd, rootsFail: true });
    const result = await callState(client);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ project: { root: path.resolve(cwd) } });
  });

  it('does not ask for roots when project_path is given', async () => {
    const root = await makeGitProject();
    const client = await connect({ cwd: await makeTempDir(), rootsHang: true });
    // The first call analyses the project; only the second, cached one measures the roots lookup.
    await callState(client, { project_path: root });
    const start = performance.now();
    const result = await callState(client, { project_path: root });
    const elapsed = performance.now() - start;
    expect(result.isError).toBeFalsy();
    expect(elapsed).toBeLessThan(2000);
    expect(result.structuredContent).toMatchObject({ project: { root: path.resolve(root) } });
  });

  it('falls back to the server folder when roots/list hangs', async () => {
    const cwd = await makeGitProject();
    const client = await connect({ cwd, rootsHang: true });
    const result = await callState(client);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ project: { root: path.resolve(cwd) } });
  }, 10000);

  it('treats an empty project_path as absent', async () => {
    const root = await makeGitProject();
    const client = await connect({ cwd: await makeTempDir(), roots: [root] });
    const result = await callState(client, { project_path: '' });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ project: { root: path.resolve(root) } });
  });

  it('server survives a bad path', async () => {
    const good = await makeGitProject();
    const client = await connect({ cwd: good });
    const missing = path.join(good, 'нет такой папки');
    const bad = await callState(client, { project_path: missing });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toContain(`Path not found: ${missing}`);
    const next = await callState(client);
    expect(next.isError).toBeFalsy();
  });
});
