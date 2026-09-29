import { cp, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { commitAll, initGitRepo, makeTempDir } from './temp-project.js';

export const FIXTURES_DIR = path.resolve(import.meta.dirname, '..', 'fixtures');

// Assembled at runtime so that no file in the repository contains a string that secret scanners
// (or our own generic/hardcoded-secret rule) would flag.
export const FAKE_SECRETS = {
  STRIPE_LIVE: ['sk', 'live', 'Zx'.repeat(12)].join('_'),
  STRIPE_TEST: ['sk', 'test', 'Qw'.repeat(12)].join('_'),
  TELEGRAM: ['123456789', `AAH${'x'.repeat(32)}`].join(':'),
  AWS: ['AKIA', 'IOSFODNN7EXAMPLE'].join(''),
  GITHUB: ['ghp', 'a'.repeat(36)].join('_'),
  PRIVATE_KEY: ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' '),
} satisfies Record<string, string>;

const SECRETS_BY_NAME: Record<string, string> = FAKE_SECRETS;
const PLACEHOLDER = /__FAKE_([A-Z0-9_]+?)__/g;

/**
 * Copies tests/fixtures/<relative> into a fresh temp folder, turns `_gitignore` / `_env…` into dot-files,
 * fills `__FAKE_<NAME>__` placeholders and (by default) commits everything to a new git repository.
 */
export async function copyFixture(relative: string, options: { git?: boolean } = {}): Promise<string> {
  const dir = await makeTempDir();
  await cp(path.join(FIXTURES_DIR, relative), dir, { recursive: true });
  await materialize(dir);
  if (options.git ?? true) {
    await initGitRepo(dir);
    await commitAll(dir, 'fixture');
  }
  return dir;
}

async function materialize(folder: string): Promise<void> {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      await materialize(full);
      continue;
    }
    const target = path.join(folder, realName(entry.name));
    if (target !== full) await rename(full, target);
    const text = await readFile(target, 'utf8');
    if (text.includes('__FAKE_')) await writeFile(target, text.replace(PLACEHOLDER, fakeSecret));
  }
}

function realName(name: string): string {
  if (name === '_gitignore') return '.gitignore';
  if (name.startsWith('_env')) return `.env${name.slice('_env'.length)}`;
  return name;
}

function fakeSecret(_placeholder: string, name: string): string {
  const value = SECRETS_BY_NAME[name];
  // A typo in a fixture must fail loudly instead of leaving a placeholder that no rule would flag.
  if (value === undefined) throw new Error(`Unknown fixture placeholder __FAKE_${name}__`);
  return value;
}
