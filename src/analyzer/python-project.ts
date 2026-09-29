import { access } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'smol-toml';
import type { SourceFile } from './files.js';

export interface PythonProject {
  /** Sorted normalised distribution names (lower case, runs of - _ . collapsed to -). */
  dependencies: string[];
  /** Sorted framework ids (values of FRAMEWORKS). */
  frameworks: string[];
  hasPytest: boolean;
  hasRuff: boolean;
  /** Project virtualenv python when one exists on disk, else plain `python`. */
  interpreter: string;
  commands: { test?: string; lint?: string };
}

type TomlTable = Record<string, unknown>;

const FRAMEWORKS: ReadonlyMap<string, string> = new Map<string, string>([
  ['aiogram', 'aiogram'],
  ['python-telegram-bot', 'python-telegram-bot'],
  ['telethon', 'telethon'],
  ['pyrogram', 'pyrogram'],
  ['fastapi', 'fastapi'],
  ['flask', 'flask'],
  ['django', 'django'],
]);

const REQUIREMENTS_FILE = /^requirements[\w.-]*\.txt$/;
const REQUIREMENT_NAME = /^([A-Za-z0-9][A-Za-z0-9._-]*)/;

/**
 * Facts from requirements*.txt, pyproject.toml and pytest/ruff config files. `venvPython` is looked up on disk by the
 * caller (virtualenv folders are not in the file list); broken files give empty facts.
 */
export function readPythonProject(files: Map<string, SourceFile>, venvPython: string | null): PythonProject {
  const pyproject = parseToml(files.get('pyproject.toml')?.content);
  const names: string[] = [];
  for (const [filePath, file] of files) {
    if (!filePath.includes('/') && REQUIREMENTS_FILE.test(filePath))
      names.push(...requirementNames(file.content ?? ''));
  }
  if (pyproject !== null) names.push(...pyprojectNames(pyproject));
  const dependencies = [...new Set(names.map(normalizeName))].sort();
  const hasPython = [...files.values()].some((file) => file.language === 'python') || dependencies.length > 0;

  const tool = asTable(pyproject?.tool);
  const hasPytest =
    hasPython &&
    (dependencies.includes('pytest') ||
      files.has('pytest.ini') ||
      asTable(tool.pytest).ini_options !== undefined ||
      [...files.keys()].some((filePath) => filePath === 'conftest.py' || filePath.endsWith('/conftest.py')));
  const hasRuff = hasPython && (tool.ruff !== undefined || files.has('ruff.toml') || files.has('.ruff.toml'));
  const interpreter = venvPython ?? 'python';
  const commands: PythonProject['commands'] = {};
  if (hasPytest) commands.test = `${interpreter} -m pytest -q`;
  if (hasRuff) commands.lint = `${interpreter} -m ruff check .`;
  return {
    dependencies,
    frameworks: [...new Set(dependencies.flatMap((name) => FRAMEWORKS.get(name) ?? []))].sort(),
    hasPytest,
    hasRuff,
    interpreter,
    commands,
  };
}

const VENV_CANDIDATES = [
  ['.venv/Scripts/python.exe', '.venv/Scripts/python'],
  ['.venv/bin/python', '.venv/bin/python'],
  ['venv/Scripts/python.exe', 'venv/Scripts/python'],
  ['venv/bin/python', 'venv/bin/python'],
] as const;

/** Virtualenv folders are skipped by the file listing, so the interpreter is looked up on disk. */
export async function findVenvPython(root: string): Promise<string | null> {
  for (const [onDisk, command] of VENV_CANDIDATES) {
    const found = await access(path.join(root, onDisk)).then(
      () => true,
      () => false,
    );
    if (found) return command;
  }
  return null;
}

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

function requirementNames(text: string): string[] {
  const names: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s#.*$/, '').trim();
    // Options (-r, -e, --index-url) and direct URLs carry no distribution name we can trust.
    if (line === '' || line.startsWith('#') || line.startsWith('-') || line.includes('://')) continue;
    const name = REQUIREMENT_NAME.exec(line)?.[1];
    if (name !== undefined) names.push(name);
  }
  return names;
}

function pyprojectNames(pyproject: TomlTable): string[] {
  const names: string[] = [];
  const addSpecs = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    for (const spec of value) {
      const name = typeof spec === 'string' ? REQUIREMENT_NAME.exec(spec.trim())?.[1] : undefined;
      if (name !== undefined) names.push(name);
    }
  };
  const project = asTable(pyproject.project);
  addSpecs(project.dependencies);
  for (const group of Object.values(asTable(project['optional-dependencies']))) addSpecs(group);
  for (const group of Object.values(asTable(pyproject['dependency-groups']))) addSpecs(group);

  const poetry = asTable(asTable(pyproject.tool).poetry);
  const addKeys = (table: unknown): void => {
    for (const name of Object.keys(asTable(table))) {
      if (name.toLowerCase() !== 'python') names.push(name);
    }
  };
  addKeys(poetry.dependencies);
  addKeys(poetry['dev-dependencies']);
  for (const group of Object.values(asTable(poetry.group))) addKeys(asTable(group).dependencies);
  return names;
}

function asTable(value: unknown): TomlTable {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as TomlTable) : {};
}

function parseToml(text: string | null | undefined): TomlTable | null {
  if (text === null || text === undefined) return null;
  try {
    return parse(text);
  } catch {
    return null;
  }
}
