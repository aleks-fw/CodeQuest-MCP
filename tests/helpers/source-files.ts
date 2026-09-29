import { type SourceFile, toSourceFile } from '../../src/analyzer/files.js';

/** In-memory SourceFiles for unit tests of pure analyzers; sorted by path like listFiles. */
export function sourceFiles(files: Record<string, string>): SourceFile[] {
  return Object.keys(files)
    .sort()
    .map((filePath) => {
      const content = files[filePath] ?? '';
      return toSourceFile({ path: filePath, size: content.length, mtimeMs: 0 }, content);
    });
}

export function byPath(files: SourceFile[]): Map<string, SourceFile> {
  return new Map<string, SourceFile>(files.map((file) => [file.path, file]));
}
