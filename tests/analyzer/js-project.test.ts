import { describe, expect, it } from 'vitest';
import { type JsProject, readJsProject } from '../../src/analyzer/js-project.js';
import { byPath, sourceFiles } from '../helpers/source-files.js';

function project(files: Record<string, string>): JsProject {
  return readJsProject(byPath(sourceFiles(files)));
}

function pkg(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

describe('readJsProject: package.json', () => {
  it('reads dependencies, frameworks, scripts, commands and the test runner', () => {
    const scripts = { dev: 'next dev', build: 'next build', lint: 'biome check .', test: 'vitest run' };
    const js = project({
      'package.json': pkg({
        name: 'shop',
        dependencies: { next: '15.0.0', react: '19.0.0', stripe: '17.0.0', '@stripe/stripe-js': '5.0.0', zod: '4.0.0' },
        devDependencies: { vitest: '5.0.2', typescript: '7.0.2' },
        scripts,
      }),
      'package-lock.json': '{}',
    });
    expect(js).toEqual({
      hasPackageJson: true,
      dependencies: ['@stripe/stripe-js', 'next', 'react', 'stripe', 'typescript', 'vitest', 'zod'],
      scripts,
      packageManager: 'npm',
      frameworks: ['next', 'react', 'stripe'],
      testRunner: 'vitest',
      commands: { test: 'npm test', lint: 'npm run lint', build: 'npm run build' },
      entryRefs: [],
      aliasBase: null,
    });
  });

  it.each([
    ['pnpm-lock.yaml', 'pnpm', 'pnpm test'],
    ['yarn.lock', 'yarn', 'yarn test'],
    ['bun.lockb', 'bun', 'bun run test'],
    ['bun.lock', 'bun', 'bun run test'],
  ] as const)('%s → %s', (lock, manager, testCommand) => {
    const js = project({ 'package.json': pkg({ scripts: { test: 'vitest run', build: 'tsc' } }), [lock]: '' });
    expect(js.packageManager).toBe(manager);
    expect(js.commands).toEqual({ test: testCommand, build: `${manager} run build` });
  });

  it('ignores the npm init test stub', () => {
    const js = project({
      'package.json': pkg({
        devDependencies: { mocha: '11.0.0' },
        scripts: { test: 'echo "Error: no test specified" && exit 1' },
      }),
    });
    expect(js.commands).toEqual({});
    expect(js.testRunner).toBe('mocha');
  });

  it('detects node:test from the test script', () => {
    const js = project({ 'package.json': pkg({ scripts: { test: 'node --test tests/' } }) });
    expect(js.testRunner).toBe('node:test');
    expect(js.commands).toEqual({ test: 'npm test' });
  });

  it('maps bot and server packages to framework ids', () => {
    const js = project({
      'package.json': pkg({
        dependencies: {
          telegraf: '4.0.0',
          express: '5.0.0',
          '@nestjs/core': '11.0.0',
          'node-telegram-bot-api': '0.66.0',
          grammy: '1.0.0',
        },
        devDependencies: { jest: '30.0.0' },
      }),
    });
    expect(js.frameworks).toEqual(['express', 'grammy', 'nestjs', 'node-telegram-bot-api', 'telegraf']);
    expect(js.testRunner).toBe('jest');
    expect(js.commands).toEqual({});
  });

  it('survives a broken package.json', () => {
    const js = project({ 'package.json': '{ "name": "x", ', 'yarn.lock': '' });
    expect(js).toEqual({
      hasPackageJson: false,
      dependencies: [],
      scripts: {},
      packageManager: 'yarn',
      frameworks: [],
      testRunner: null,
      commands: {},
      entryRefs: [],
      aliasBase: null,
    });
  });

  it('treats a missing or non-object package.json as absent', () => {
    const missing = project({ 'README.md': '# x\n' });
    expect(missing.hasPackageJson).toBe(false);
    expect(missing.packageManager).toBe('npm');
    expect(project({ 'package.json': '[]' }).hasPackageJson).toBe(false);
  });

  it('collects entry refs from main, bin and exports', () => {
    const js = project({
      'package.json': pkg({
        main: './dist/index.js',
        bin: { cq: './bin/cli.js', other: 'bin/other.js' },
        exports: {
          '.': { import: './src/index.ts', require: './dist/index.cjs' },
          './package.json': './package.json',
        },
      }),
    });
    expect(js.entryRefs).toEqual([
      'bin/cli.js',
      'bin/other.js',
      'dist/index.cjs',
      'dist/index.js',
      'package.json',
      'src/index.ts',
    ]);
    expect(project({ 'package.json': pkg({ bin: './cli.js' }) }).entryRefs).toEqual(['cli.js']);
  });
});

describe('readJsProject: @/ alias', () => {
  it('reads a tsconfig.json with comments and trailing commas', () => {
    const tsconfig = [
      '{',
      '  // editor settings',
      '  "compilerOptions": {',
      '    /* aliases */ "baseUrl": ".",',
      '    "paths": { "@/*": ["./src/*"], },',
      '  },',
      '}',
    ].join('\n');
    expect(project({ 'tsconfig.json': tsconfig }).aliasBase).toBe('src/');
  });

  it('joins the target with baseUrl', () => {
    const tsconfig = pkg({ compilerOptions: { baseUrl: 'src', paths: { '@/*': ['*'] } } });
    expect(project({ 'tsconfig.json': tsconfig }).aliasBase).toBe('src/');
  });

  it('falls back to jsconfig.json and supports a root alias', () => {
    const jsconfig = pkg({ compilerOptions: { paths: { '@/*': ['./*'] } } });
    expect(project({ 'jsconfig.json': jsconfig }).aliasBase).toBe('');
  });

  it('is null without an @/* path or with a broken tsconfig.json', () => {
    expect(project({ 'tsconfig.json': pkg({ compilerOptions: { strict: true } }) }).aliasBase).toBeNull();
    const jsconfig = pkg({ compilerOptions: { paths: { '@/*': ['./src/*'] } } });
    expect(project({ 'tsconfig.json': '{ "compilerOptions": ', 'jsconfig.json': jsconfig }).aliasBase).toBeNull();
  });
});
