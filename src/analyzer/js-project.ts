import path from 'node:path';
import type { SourceFile } from './files.js';
import { parseJsonc } from './jsonc.js';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
export type TestRunner = 'vitest' | 'jest' | 'mocha' | 'node:test';

export interface JsProject {
  /** True only when the root package.json parsed to an object. */
  hasPackageJson: boolean;
  /** Sorted union of dependencies and devDependencies. */
  dependencies: string[];
  scripts: Record<string, string>;
  packageManager: PackageManager;
  /** Sorted framework ids (values of FRAMEWORKS). */
  frameworks: string[];
  testRunner: TestRunner | null;
  commands: { test?: string; lint?: string; build?: string };
  /** Sorted targets of main, bin and exports, without a leading './'. */
  entryRefs: string[];
  /** '@/x' resolves to aliasBase + 'x' ('src/' or ''); null when there is no '@/*' path. */
  aliasBase: string | null;
}

type JsonObject = Record<string, unknown>;

// A Map, not an object literal: a dependency named "constructor" must not hit Object.prototype.
const FRAMEWORKS: ReadonlyMap<string, string> = new Map<string, string>([
  ['next', 'next'],
  ['react', 'react'],
  ['vue', 'vue'],
  ['svelte', 'svelte'],
  ['express', 'express'],
  ['fastify', 'fastify'],
  ['koa', 'koa'],
  ['@nestjs/core', 'nestjs'],
  ['telegraf', 'telegraf'],
  ['grammy', 'grammy'],
  ['node-telegram-bot-api', 'node-telegram-bot-api'],
  ['stripe', 'stripe'],
  ['@stripe/stripe-js', 'stripe'],
]);

const RUNNER_DEPENDENCIES = ['vitest', 'jest', 'mocha'] as const;

/** Facts from the root package.json, lock files and tsconfig/jsconfig; broken files give empty facts. */
export function readJsProject(files: Map<string, SourceFile>): JsProject {
  const pkg = parseObject(files.get('package.json')?.content);
  const dependencies = sortedUnique([
    ...Object.keys(asObject(pkg?.dependencies)),
    ...Object.keys(asObject(pkg?.devDependencies)),
  ]);
  const scripts = stringEntries(pkg?.scripts);
  const packageManager = detectManager(files);
  return {
    hasPackageJson: pkg !== null,
    dependencies,
    scripts,
    packageManager,
    frameworks: sortedUnique(dependencies.flatMap((dependency) => FRAMEWORKS.get(dependency) ?? [])),
    testRunner: detectTestRunner(dependencies, scripts),
    commands: detectCommands(scripts, packageManager),
    entryRefs: pkg === null ? [] : collectEntryRefs(pkg),
    aliasBase: readAliasBase(files),
  };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function parseObject(text: string | null | undefined): JsonObject | null {
  if (text === null || text === undefined) return null;
  try {
    const value = parseJsonc(text);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function stringEntries(value: unknown): Record<string, string> {
  const entries = Object.entries(asObject(value)).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  // fromEntries defines own properties, so a "__proto__" script cannot change the prototype.
  return Object.fromEntries(entries);
}

function detectManager(files: Map<string, SourceFile>): PackageManager {
  if (files.has('pnpm-lock.yaml')) return 'pnpm';
  if (files.has('yarn.lock')) return 'yarn';
  if (files.has('bun.lockb') || files.has('bun.lock')) return 'bun';
  return 'npm';
}

function detectTestRunner(dependencies: string[], scripts: Record<string, string>): TestRunner | null {
  for (const runner of RUNNER_DEPENDENCIES) {
    if (dependencies.includes(runner)) return runner;
  }
  return scripts.test?.includes('node --test') ? 'node:test' : null;
}

function detectCommands(scripts: Record<string, string>, manager: PackageManager): JsProject['commands'] {
  const commands: JsProject['commands'] = {};
  const test = scripts.test;
  // `npm init` writes a test script that only fails; it is not a real test command.
  if (test !== undefined && !/no test specified/.test(test)) {
    commands.test = manager === 'bun' ? 'bun run test' : `${manager} test`;
  }
  if (scripts.lint !== undefined) commands.lint = `${manager} run lint`;
  if (scripts.build !== undefined) commands.build = `${manager} run build`;
  return commands;
}

function collectEntryRefs(pkg: JsonObject): string[] {
  const refs: string[] = [];
  if (typeof pkg.main === 'string') refs.push(pkg.main);
  if (typeof pkg.bin === 'string') {
    refs.push(pkg.bin);
  } else {
    for (const value of Object.values(asObject(pkg.bin))) {
      if (typeof value === 'string') refs.push(value);
    }
  }
  collectStrings(pkg.exports, refs);
  return sortedUnique(refs.map((ref) => ref.replace(/^(?:\.\/)+/, '')));
}

/** Every string leaf of an exports map (conditions and subpaths nest arbitrarily). */
function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (isObject(value)) {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
}

function readAliasBase(files: Map<string, SourceFile>): string | null {
  // A broken tsconfig.json still wins over jsconfig.json: the TypeScript tooling would not read jsconfig either.
  const config = files.get('tsconfig.json') ?? files.get('jsconfig.json');
  const options = parseObject(config?.content)?.compilerOptions;
  if (!isObject(options) || !isObject(options.paths)) return null;
  const targets = options.paths['@/*'];
  const first: unknown = Array.isArray(targets) ? targets[0] : undefined;
  if (typeof first !== 'string') return null;
  const baseUrl = typeof options.baseUrl === 'string' ? options.baseUrl : '.';
  let base = path.posix.normalize(path.posix.join(baseUrl, first));
  if (base.endsWith('*')) base = base.slice(0, -1);
  base = base.replace(/^(?:\.\/)+/, '');
  if (base === '' || base === '.') return '';
  return base.endsWith('/') ? base : `${base}/`;
}
