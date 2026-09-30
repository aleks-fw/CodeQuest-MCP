// Acceptance run (spec §11): read-only analysis of projects, boards side by side.
// Usage: node scripts/acceptance.mjs <name=path>... [--out report.md]
// Every project is copied first (fake secrets filled in, as in the test fixtures), so the originals are never touched
// and nothing is written into them. Progress data goes to D:\Claude\acceptance-data\run-<time>.
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Engine } from '../dist/engine/index.js';
import { boardText, statsText } from '../dist/hud/present.js';

const FAKE = {
  STRIPE_LIVE: ['sk', 'live', 'Zx'.repeat(12)].join('_'),
  STRIPE_TEST: ['sk', 'test', 'Qw'.repeat(12)].join('_'),
  TELEGRAM: ['123456789', `AAH${'x'.repeat(32)}`].join(':'),
  AWS: ['AKIA', 'IOSFODNN7EXAMPLE'].join(''),
  GITHUB: ['ghp', 'a'.repeat(36)].join('_'),
  PRIVATE_KEY: ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' '),
};

async function fill(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await fill(full);
    else {
      const text = await readFile(full, 'utf8').catch(() => null);
      if (text?.includes('__FAKE_')) await writeFile(full, text.replace(/__FAKE_([A-Z0-9_]+?)__/g, (_m, name) => FAKE[name] ?? _m));
    }
  }
}

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? args[outIndex + 1] : null;
const targets = args.filter((arg, index) => arg.includes('=') && (outIndex < 0 || index !== outIndex + 1)).map((arg) => arg.split(/=(.*)/s));

const stamp = new Date().toISOString().replace(/[^\dA-Za-z]/g, '-');
const work = path.join('D:\\Claude\\acceptance-data', `run-${stamp}`);
const sections = [];
for (const [name, source] of targets) {
  const copy = path.join(work, 'projects', name);
  await mkdir(path.dirname(copy), { recursive: true });
  const skip = new Set(['node_modules', '.venv', 'venv', '__pycache__', '.next', 'dist']);
  await cp(source, copy, { recursive: true, filter: (from) => !skip.has(path.basename(from)) });
  await fill(copy);
  const engine = new Engine({ home: path.join(work, 'data'), cwd: copy, now: () => new Date() });
  const started = Date.now();
  const view = await engine.refresh({ projectPath: copy }, true);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const facts = view.snapshot?.facts;
  const rules = new Map();
  for (const finding of view.snapshot?.findings ?? []) rules.set(finding.rule, (rules.get(finding.rule) ?? 0) + 1);
  sections.push(
    [
      `## ${name}`,
      '',
      `Analysis: ${seconds}s · ${facts?.sourceFiles} code files · stacks ${facts?.stacks.join('+')} · types ${
        facts?.domains.filter((d) => d.pack !== 'generic').map((d) => d.pack).join(', ') || 'generic'
      } · errors ${view.snapshot?.errors.length ?? 0}`,
      '',
      '```',
      boardText(view),
      '```',
      '',
      '```',
      statsText(view),
      '```',
      '',
      `Findings by rule: ${[...rules].map(([rule, count]) => `${rule} ×${count}`).join(', ')}`,
    ].join('\n'),
  );
}
const report = sections.join('\n\n');
console.log(report);
if (out) await writeFile(out, `# CodeQuest acceptance run\n\n${report}\n`);
