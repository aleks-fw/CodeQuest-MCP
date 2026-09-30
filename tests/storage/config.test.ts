import { readFile, writeFile } from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { configFile, readLanguage, writeLanguage } from '../../src/storage/config.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

describe('config.json', () => {
  it('defaults to English, and remembers a written language', async () => {
    const home = await makeTempDir();
    expect(await readLanguage(home)).toBe('en');
    await writeLanguage(home, 'ru');
    expect(await readLanguage(home)).toBe('ru');
    expect(JSON.parse(await readFile(configFile(home), 'utf8'))).toEqual({ schema: 1, language: 'ru' });
  });

  it('a broken file or a wrong value means English, and a new write repairs it', async () => {
    const home = await makeTempDir();
    await writeFile(configFile(home), '{not json');
    expect(await readLanguage(home)).toBe('en');
    await writeFile(configFile(home), JSON.stringify({ schema: 1, language: 5 }));
    expect(await readLanguage(home)).toBe('en');
    await writeLanguage(home, 'ru');
    expect(await readLanguage(home)).toBe('ru');
  });
});
