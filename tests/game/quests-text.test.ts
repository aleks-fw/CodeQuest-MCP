import { describe, expect, it } from 'vitest';
import { type Group, TEMPLATES } from '../../src/game/quests/templates.js';
import { groupVars, templateText } from '../../src/game/quests/text.js';
import type { Finding } from '../../src/types.js';

const finding = (file: string | undefined, key = 'k'): Finding => ({
  id: `id-${file ?? 'none'}`,
  rule: 'generic/todo',
  category: 'cleanup',
  severity: 'low',
  message: 'm',
  key,
  ...(file === undefined ? {} : { file }),
});
const group = (...files: string[]): Group => ({
  findings: files.map((file) => finding(file)),
  files: [...files].sort(),
});

describe('group variables', () => {
  it('describe the subject of a group', () => {
    expect(groupVars(group('src/cart.ts'))).toMatchObject({ sk: 'file', sv: 'cart.ts', n: 1, stem: 'cart' });
    expect(groupVars(group('src/a.ts', 'src/b.ts'))).toMatchObject({ sk: 'dir', sv: 'src/', n: 2 });
    expect(groupVars(group('a.ts', 'b.ts'))).toMatchObject({ sk: 'root', n: 2 });
    expect(groupVars(group('a/x.ts', 'b/y.ts', 'c/z.ts'))).toMatchObject({ sk: 'files', n: 3 });
    expect(groupVars({ findings: [], files: [] })).toMatchObject({ sk: 'project', n: 0, stem: '', cycle: '' });
  });
});

describe('English quest texts come from the catalog and equal the old strings', () => {
  const en = (id: string, part: 'title' | 'desc', g: Group) => templateText('en', id, part, groupVars(g));
  it('titles and descriptions', () => {
    expect(en('protect-cart', 'title', group('lib/cart.ts'))).toBe('Protect Cart');
    expect(en('protect-cart', 'desc', group('lib/cart.ts'))).toBe(
      'Add tests for cart.ts: at least 3 test cases that import it.',
    );
    expect(en('add-tests-for-module', 'title', group('lib/cart.ts'))).toBe('Add Tests for cart');
    expect(en('remove-dead-code', 'desc', group('a.ts', 'b.ts'))).toBe(
      'Delete the root folder: nothing imports it and it is not an entry point.',
    );
    expect(en('remove-dead-code', 'desc', group('src/a.ts', 'src/b.ts'))).toBe(
      'Delete src/: nothing imports it and it is not an entry point.',
    );
    expect(en('clean-up-todos', 'desc', group('a/x.ts', 'b/y.ts', 'c/z.ts'))).toBe(
      'Resolve or remove the TODO comments in 3 files.',
    );
    expect(en('handle-errors-in-file', 'title', group('app/x.py'))).toBe('Handle Errors in x.py');
    expect(en('write-readme', 'desc', { findings: [], files: [] })).toBe(
      'Write a README of at least 10 lines: what the project does and how to run it.',
    );
  });
  it('the cycle quest names the file, or the project when there is none', () => {
    const g: Group = { findings: [finding('src/a.ts', 'src/a.ts|src/b.ts')], files: ['src/a.ts'] };
    expect(en('break-import-cycle', 'desc', g)).toBe('Break the import cycle through src/a.ts.');
    expect(en('break-import-cycle', 'desc', { findings: [], files: [] })).toBe(
      'Break the import cycle through the project.',
    );
  });
  it('every template has a title and a description in the catalog', () => {
    for (const template of TEMPLATES) {
      for (const part of ['title', 'desc'] as const) {
        expect(
          templateText('en', template.id, part, groupVars(group('src/x.ts'))),
          `${template.id} ${part}`,
        ).not.toMatch(/^quest\./);
      }
    }
  });
});

describe('Russian quest texts', () => {
  const ru = (id: string, part: 'title' | 'desc', g: Group) => templateText('ru', id, part, groupVars(g));
  it('every template has Russian text, different from the key', () => {
    for (const template of TEMPLATES) {
      for (const part of ['title', 'desc'] as const) {
        const text = ru(template.id, part, group('src/x.ts'));
        expect(text, `${template.id} ${part}`).not.toMatch(/^quest\./);
        expect(text, `${template.id} ${part}`).toMatch(/[А-Яа-яЁё]/);
      }
    }
  });
  it('the subject takes the case the sentence needs', () => {
    expect(ru('clean-up-todos', 'desc', group('src/a.ts'))).toBe('Реши или удали TODO-комментарии в a.ts.');
    expect(ru('clean-up-todos', 'desc', group('a.ts', 'b.ts'))).toBe(
      'Реши или удали TODO-комментарии в корневой папке.',
    );
    expect(ru('clean-up-todos', 'desc', group('a/x.ts', 'b/y.ts', 'c/z.ts'))).toBe(
      'Реши или удали TODO-комментарии в 3 файлах.',
    );
    expect(ru('remove-dead-code', 'desc', group('a.ts', 'b.ts'))).toBe(
      'Удали корневую папку: код нигде не импортируется и не является точкой входа.',
    );
    expect(ru('remove-dead-code', 'desc', group('a/x.ts', 'b/y.ts', 'c/z.ts', 'd/w.ts', 'e/v.ts'))).toBe(
      'Удали 5 файлов: код нигде не импортируется и не является точкой входа.',
    );
    expect(ru('remove-dead-code', 'desc', group('a/x.ts', 'b/y.ts'))).toBe(
      'Удали 2 файла: код нигде не импортируется и не является точкой входа.',
    );
    expect(ru('add-tests-for-module', 'desc', group('lib/cart.ts'))).toContain('Добавь тесты для cart.ts');
    expect(ru('add-tests-for-module', 'title', group('lib/cart.ts'))).toBe('Тесты для cart');
    expect(ru('break-import-cycle', 'desc', { findings: [], files: [] })).toBe('Разорви цикл импортов через проект.');
  });
});
