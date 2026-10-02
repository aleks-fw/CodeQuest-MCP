import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { type CliIo, parse, runCli } from '../../src/cli/run.js';
import { CodeQuestError, errorText } from '../../src/errors.js';
import { findQuest } from '../../src/game/quests/board.js';
import { CATALOGS } from '../../src/i18n/index.js';
import { toolError } from '../../src/tools/errors.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

afterAll(cleanupTempDirs);

describe('localized errors', () => {
  it('an error with a text key is shown in the language, an old one as its own message', () => {
    const keyed = new CodeQuestError('Path not found: /x', { key: 'error.pathMissing', vars: { path: '/x' } });
    expect(errorText(keyed, 'en')).toBe('Path not found: /x');
    expect(errorText(keyed, 'ru')).toBe('Путь не найден: /x');
    expect(errorText(new CodeQuestError('plain'), 'ru')).toBe('plain');
  });

  it('an unexpected error is worded in the language too, with its own message kept', () => {
    expect(errorText(new Error('boom'), 'en')).toBe('Unexpected error: boom');
    expect(errorText(new Error('boom'), 'ru')).toBe('Непредвиденная ошибка: boom');
    expect(errorText('plain {text}', 'ru')).toBe('Непредвиденная ошибка: plain {text}');
  });

  it('every error key has a Russian and an English text', () => {
    const keys = Object.keys(CATALOGS.en).filter((key) => key.startsWith('error.'));
    expect(keys.length).toBeGreaterThanOrEqual(9);
    for (const key of keys) expect(CATALOGS.ru[key], key).toBeDefined();
  });

  it('findQuest errors carry a text for the language', () => {
    const quests = [
      { id: 'aaaaa1', title: 'A' },
      { id: 'aaaaa2', title: 'B' },
    ] as never;
    expect(findQuest(quests, 'zzz')).toMatchObject({ error: 'No quest "zzz"', text: { key: 'error.noQuest' } });
    expect(findQuest(quests, '  ')).toMatchObject({ text: { key: 'error.noQuestGiven' } });
    expect(findQuest(quests, 'aaaaa')).toMatchObject({ text: { key: 'error.questPrefix' } });
  });

  it('a tool error follows the language', () => {
    const error = new CodeQuestError('No quest "q"', { key: 'error.noQuest', vars: { ref: 'q' } });
    expect(toolError(error, 'ru').content).toEqual([{ type: 'text', text: 'Нет квеста «q»' }]);
    expect(toolError(error, 'en').content).toEqual([{ type: 'text', text: 'No quest "q"' }]);
  });

  it('a bad option is a localized error too', () => {
    const parsed = parse(['--bogus']);
    expect(parsed).toBeInstanceOf(CodeQuestError);
    expect(errorText(parsed as CodeQuestError, 'ru')).toBe('Неизвестный параметр --bogus');
  });

  it('the CLI prints errors in the saved language', async () => {
    const project = await copyFixture('projects/nextjs-shop');
    const home = await makeTempDir();
    const err: string[] = [];
    const io: CliIo = { stdout: () => {}, stderr: (text) => err.push(text), cwd: await makeTempDir(), env: {} };
    const run = (...argv: string[]) => runCli([...argv, '--home', home], io);
    await run('lang', 'ru');
    err.length = 0;
    expect(await run('hud', '--path', path.join(project, 'нет такой папки'))).toBe(1);
    expect(err.join('')).toContain('Путь не найден');
    err.length = 0;
    await run('hud', '--path', project);
    expect(await run('verify', 'nope', '--path', project)).toBe(1);
    expect(err.join('')).toContain('Нет квеста «nope»');
    err.length = 0;
    expect(await run('hud', '--bogus')).toBe(1);
    expect(err.join('')).toContain('Неизвестный параметр --bogus');
  });
});
