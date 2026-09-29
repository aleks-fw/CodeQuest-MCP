import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ReadResult = { status: 'ok'; value: unknown } | { status: 'missing' } | { status: 'broken'; error: string };

const RETRY_CODES: ReadonlySet<string> = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_TRIES = 6;

/** Temp file next to the target, then rename: a reader never sees half a file (spec §5). */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  try {
    await renameWithRetry(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/** Windows can refuse a rename for a moment while antivirus or an indexer holds the target. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (!RETRY_CODES.has(code) || attempt >= RENAME_TRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt));
    }
  }
}

export async function readJson(file: string): Promise<ReadResult> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'missing' };
    return { status: 'broken', error: error instanceof Error ? error.message : String(error) };
  }
  try {
    return { status: 'ok', value: JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) as unknown };
  } catch (error) {
    return { status: 'broken', error: error instanceof Error ? error.message : String(error) };
  }
}
