import { describe, expect, it } from 'vitest';
import { envTrackedRule } from '../../src/analyzer/rules/env-tracked.js';
import { noEnvExampleRule } from '../../src/analyzer/rules/no-env-example.js';
import { noLockfileRule } from '../../src/analyzer/rules/no-lockfile.js';
import { noReadmeRule } from '../../src/analyzer/rules/no-readme.js';
import { runRule } from '../helpers/rule-context.js';

const tenLines = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');

describe('generic/no-readme', () => {
  it('reports a missing root README without a file', () => {
    expect(runRule(noReadmeRule, { 'docs/README.md': tenLines, 'src/a.ts': 'x\n' })).toEqual([
      { message: 'Project has no README', key: '' },
    ]);
  });

  it('reports a short README without a file, naming the path in the message', () => {
    expect(runRule(noReadmeRule, { 'readme.txt': '# App\n\nshort\n' })).toEqual([
      { message: 'readme.txt has only 2 non-empty lines (need 10+)', key: '' },
    ]);
  });

  it('gives a missing and a short README the same finding identity', () => {
    const [missing] = runRule(noReadmeRule, { 'src/a.ts': 'x\n' });
    const [short] = runRule(noReadmeRule, { 'README.md': 'one line\n' });
    expect(missing?.file).toBeUndefined();
    expect(short?.file).toBeUndefined();
    expect(short?.key).toBe(missing?.key);
  });

  it('accepts a README with 10 non-empty lines', () => {
    expect(runRule(noReadmeRule, { 'README.md': tenLines })).toEqual([]);
  });
});

describe('generic/no-env-example', () => {
  it('reports env reads without an example file', () => {
    const hits = runRule(noEnvExampleRule, {
      'src/config.ts': 'export const port = process.env.PORT;\n',
      'bot.py': 'import os\ntoken = os.getenv("BOT_TOKEN")\n',
    });
    expect(hits).toEqual([
      { message: 'Code reads environment variables (bot.py and 1 more) but there is no .env.example', key: '' },
    ]);
  });

  it.each(['.env.example', '.env.sample', '.env.template'])('is satisfied by %s', (name) => {
    expect(runRule(noEnvExampleRule, { 'src/config.ts': 'process.env.PORT;\n', [name]: 'PORT=\n' })).toEqual([]);
  });

  it('stays silent when code does not read the environment', () => {
    expect(runRule(noEnvExampleRule, { 'src/a.ts': 'export const env = "production";\n' })).toEqual([]);
  });
});

describe('generic/no-lockfile', () => {
  it('reports package.json without a lock file', () => {
    expect(runRule(noLockfileRule, { 'package.json': '{}' })).toEqual([
      { file: 'package.json', message: 'package.json has no lock file, so installs are not reproducible', key: '' },
    ]);
  });

  it('accepts any known lock file and projects without package.json', () => {
    expect(runRule(noLockfileRule, { 'package.json': '{}', 'yarn.lock': '' })).toEqual([]);
    expect(runRule(noLockfileRule, { 'index.html': '<p></p>\n' })).toEqual([]);
  });
});

describe('generic/env-tracked', () => {
  it('reports a .env committed to git', () => {
    expect(runRule(envTrackedRule, { '.env': 'A=1\n' }, { tracked: ['.env'] })).toEqual([
      { file: '.env', message: '.env is committed to git', key: '.env' },
    ]);
  });

  it('reports an untracked .env that git does not ignore', () => {
    expect(runRule(envTrackedRule, { 'apps/api/.env': 'A=1\n' }, { tracked: [] })).toEqual([
      { file: 'apps/api/.env', message: 'apps/api/.env is not ignored by git', key: 'apps/api/.env' },
    ]);
  });

  it('outside git checks the root .gitignore', () => {
    expect(runRule(envTrackedRule, { '.env': 'A=1\n' })).toEqual([
      { file: '.env', message: '.env is not listed in .gitignore', key: '.env' },
    ]);
    expect(runRule(envTrackedRule, { '.env': 'A=1\n', '.gitignore': 'node_modules/\n.env*\n' })).toEqual([]);
    // "/.env" covers only the root file, not a nested one.
    expect(runRule(envTrackedRule, { 'apps/api/.env': 'A=1\n', '.gitignore': '/.env\n' })).toEqual([
      { file: 'apps/api/.env', message: 'apps/api/.env is not listed in .gitignore', key: 'apps/api/.env' },
    ]);
  });

  it('reports .env.<name> files but not example, sample or template files', () => {
    const files = {
      '.env.production': 'A=1\n',
      'apps/api/.env.local': 'A=1\n',
      '.env.example': 'A=\n',
      '.env.sample': 'A=\n',
      '.env.local.template': 'A=\n',
    };
    const tracked = Object.keys(files);
    expect(runRule(envTrackedRule, files, { tracked })).toEqual([
      { file: '.env.production', message: '.env.production is committed to git', key: '.env.production' },
      { file: 'apps/api/.env.local', message: 'apps/api/.env.local is committed to git', key: 'apps/api/.env.local' },
    ]);
  });

  it('outside git a variant needs its own ignore line', () => {
    const hits = (gitignore: string) =>
      runRule(envTrackedRule, { '.env.production': 'A=1\n', '.gitignore': gitignore });
    expect(hits('.env\n')).toHaveLength(1);
    expect(hits('.env.production\n')).toEqual([]);
    expect(hits('.env.*\n')).toEqual([]);
    expect(hits('.env*\n')).toEqual([]);
  });
});
