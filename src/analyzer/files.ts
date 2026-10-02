import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { runGit } from './git.js';
import { mapLimit } from './map-limit.js';

export type Language = 'typescript' | 'javascript' | 'python' | 'html' | 'css' | 'other';
export type FileKind = 'code' | 'test' | 'config' | 'other';

export interface ListedFile {
  /** Relative to the project root, with / separators. */
  path: string;
  size: number;
  mtimeMs: number;
}

export interface SourceFile extends ListedFile {
  language: Language;
  kind: FileKind;
  /** null for files over MAX_READ_BYTES and binary files. */
  content: string | null;
  /** content split on \r?\n, without a trailing empty line. */
  lines: string[];
}

export interface FileListing {
  files: ListedFile[];
  /** Files in the git index; empty outside git. */
  tracked: Set<string>;
  isGitRepo: boolean;
}

export const MAX_READ_BYTES = 1024 * 1024;
const IO_LIMIT = 64;

export const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  '.mypy_cache',
  '.pytest_cache',
]);

const LANGUAGE_BY_EXT: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
};

const CODE_EXTS: ReadonlySet<string> = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py']);

export function languageOf(filePath: string): Language {
  return LANGUAGE_BY_EXT[path.posix.extname(filePath).toLowerCase()] ?? 'other';
}

export function isCodePath(filePath: string): boolean {
  return CODE_EXTS.has(path.posix.extname(filePath).toLowerCase());
}

export function isTestPath(filePath: string): boolean {
  const base = path.posix.basename(filePath);
  const folders = filePath.split('/').slice(0, -1);
  if (filePath.endsWith('.py')) {
    return /^test_.*\.py$/.test(base) || base.endsWith('_test.py') || folders.includes('tests');
  }
  return (
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(base) ||
    folders.some((folder) => ['__tests__', 'tests', 'fixtures', '__fixtures__'].includes(folder))
  );
}

export function kindOf(filePath: string): FileKind {
  if (!isCodePath(filePath)) return 'other';
  const base = path.posix.basename(filePath);
  if (base === 'conftest.py' || base === 'setup.py') return 'config';
  if (isTestPath(filePath)) return 'test';
  if (/\.config\.[cm]?[jt]s$/.test(base)) return 'config';
  return 'code';
}

/** Project files: git ls-files (tracked + untracked, not ignored) in a repo, a filtered walk outside git. */
export async function listFiles(root: string): Promise<FileListing> {
  const all = await runGit(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  if (all.ok) {
    const cached = await runGit(root, ['ls-files', '-z', '--cached']);
    const tracked = new Set(splitNul(cached.stdout));
    return { files: await statAll(root, [...new Set(splitNul(all.stdout))]), tracked, isGitRepo: true };
  }
  return { files: await statAll(root, await walk(root, '')), tracked: new Set(), isGitRepo: false };
}

export async function loadFiles(root: string, listed: ListedFile[]): Promise<SourceFile[]> {
  return mapLimit(listed, IO_LIMIT, async (file) =>
    toSourceFile(file, await readText(path.join(root, file.path), file.size)),
  );
}

export function toSourceFile(file: ListedFile, content: string | null): SourceFile {
  const lines = content === null ? [] : content.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return { ...file, language: languageOf(file.path), kind: kindOf(file.path), content, lines };
}

async function readText(fullPath: string, size: number): Promise<string | null> {
  if (size > MAX_READ_BYTES) return null;
  const buffer = await readFile(fullPath).catch(() => null);
  if (!buffer || buffer.subarray(0, 8000).includes(0)) return null;
  const text = buffer.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function splitNul(text: string): string[] {
  return text.split('\0').filter((part) => part.length > 0);
}

async function statAll(root: string, relativePaths: string[]): Promise<ListedFile[]> {
  const stats = await mapLimit(relativePaths, IO_LIMIT, async (relative) => {
    const info = await stat(path.join(root, relative)).catch(() => null);
    return info?.isFile() ? { path: relative.replaceAll('\\', '/'), size: info.size, mtimeMs: info.mtimeMs } : null;
  });
  return stats
    .filter((file): file is ListedFile => file !== null)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

async function walk(root: string, folder: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(path.join(root, folder), { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    const relative = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...(await walk(root, relative)));
    } else if (entry.isFile()) {
      found.push(relative);
    }
  }
  return found;
}
