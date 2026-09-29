import { readFile } from 'node:fs/promises';

export async function GET(): Promise<Response> {
  const report = await readFile('data/report.json', 'utf8');
  return new Response(report, { headers: { 'content-type': 'application/json' } });
}
