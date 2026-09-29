import { afterAll, describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/analyzer/analyze.js';
import { jsRawImgRule } from '../../src/analyzer/rules/js-raw-img.js';
import { jsSyncFsInHandlerRule } from '../../src/analyzer/rules/js-sync-fs-in-handler.js';
import type { Rule } from '../../src/analyzer/rules/types.js';
import type { Finding } from '../../src/types.js';
import { cleanupTempDirs, makeGitProject } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

async function findingsOf(rule: Rule, files: Record<string, string>): Promise<Finding[]> {
  const root = await makeGitProject(files);
  return (await analyzeProject(root, { now: new Date(0), rules: [rule] })).findings;
}

const HERO = 'export function Hero() {\n  return <img src="/hero.png" alt="Hero" />;\n}\n';

describe('js/sync-fs-in-handler', () => {
  it('finds sync fs calls in an Express handler file, skipping comments and non-handler files', async () => {
    const findings = await findingsOf(jsSyncFsInHandlerRule, {
      'src/server.ts': [
        "import express from 'express';",
        "import { readFileSync } from 'node:fs';",
        '',
        'const app = express();',
        '',
        "app.get('/report', (_req, res) => {",
        '  // readFileSync(path) would block here',
        "  res.send(readFileSync('report.txt', 'utf8'));",
        '});',
        '',
      ].join('\n'),
      'src/config.ts': [
        "import fs from 'node:fs';",
        '',
        "export const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));",
        '',
      ].join('\n'),
    });
    expect(findings.map((finding) => [finding.file, finding.line, finding.message])).toEqual([
      ['src/server.ts', 8, 'readFileSync() blocks the event loop inside a request handler'],
    ]);
  });
});

describe('js/raw-img', () => {
  it('stays silent when the project does not use Next.js', async () => {
    const findings = await findingsOf(jsRawImgRule, {
      'package.json': JSON.stringify({ name: 'spa', dependencies: { react: '19.1.1' } }),
      'src/Hero.tsx': HERO,
    });
    expect(findings).toEqual([]);
  });

  it('flags <img> in a Next.js project', async () => {
    const findings = await findingsOf(jsRawImgRule, {
      'package.json': JSON.stringify({ name: 'site', dependencies: { next: '15.5.4', react: '19.1.1' } }),
      'src/Hero.tsx': HERO,
    });
    expect(findings.map((finding) => [finding.file, finding.line])).toEqual([['src/Hero.tsx', 2]]);
  });
});
