import { readFileSync } from 'node:fs';

export async function GET(): Promise<Response> {
  const report = readFileSync('data/report.json', 'utf8');
  return new Response(report, { headers: { 'content-type': 'application/json' } });
}
