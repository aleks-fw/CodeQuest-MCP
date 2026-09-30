import { describe, expect, it } from 'vitest';
import { type Group, TEMPLATES } from '../../src/game/quests/templates.js';
import { backfillVars, groupVars, questDescription, questTitle, templateText } from '../../src/game/quests/text.js';
import { type Lang, t } from '../../src/i18n/index.js';
import type { Finding, Quest } from '../../src/types.js';

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

// Independent literals (English from the pre-i18n lambdas, Russian from the catalog table), never read from the catalog.
const EXACT: [string, string, string, string, string][] = [
  [
    'protect-cart',
    'Protect Cart',
    'Add tests for x.ts: at least 3 test cases that import it.',
    'Защита корзины',
    'Добавь тесты для x.ts: не менее 3 тест-кейсов, которые импортируют тестируемый код.',
  ],
  [
    'payment-guardian',
    'Payment Guardian',
    'Add tests for x.ts: at least 3 test cases that import it.',
    'Страж платежей',
    'Добавь тесты для x.ts: не менее 3 тест-кейсов, которые импортируют тестируемый код.',
  ],
  [
    'validate-payment-webhooks',
    'Validate Payment Webhooks',
    'Verify the signature of every request in x.ts before trusting the event.',
    'Проверка вебхуков оплаты',
    'Проверяй подпись каждого запроса в x.ts, прежде чем доверять событию.',
  ],
  [
    'clean-inventory',
    'Clean Inventory',
    'Remove the unused product component x.ts.',
    'Чистка каталога',
    'Удали неиспользуемые компоненты товара: x.ts.',
  ],
  [
    'handle-api-errors',
    'Handle API Errors',
    'Register a global error handler so one failing update cannot stop the bot.',
    'Обработка ошибок API',
    'Добавь глобальный обработчик ошибок, чтобы одно упавшее обновление не остановило бота.',
  ],
  [
    'guard-admin-commands',
    'Guard Admin Commands',
    'Check permissions before running the admin command in x.ts.',
    'Защита админ-команд',
    'Проверь права перед выполнением админ-команды в x.ts.',
  ],
  [
    'test-message-parsing',
    'Test Message Parsing',
    'Add tests for x.ts: at least 3 test cases that import it.',
    'Тесты разбора сообщений',
    'Добавь тесты для x.ts: не менее 3 тест-кейсов, которые импортируют тестируемый код.',
  ],
  [
    'improve-command-routing',
    'Improve Command Routing',
    'Split the handler registrations of x.ts into routers or modules.',
    'Улучшение маршрутизации команд',
    'Раздели регистрацию обработчиков в x.ts на роутеры или модули.',
  ],
  [
    'add-retry-logic',
    'Add Retry Logic',
    'Give the HTTP calls in x.ts a timeout (and retry where it makes sense).',
    'Повторы и таймауты',
    'Добавь таймаут (и повтор, где это уместно) для HTTP-вызовов в x.ts.',
  ],
  [
    'protect-the-token',
    'Protect the Token',
    'Move the bot token out of x.ts into an environment variable.',
    'Защита токена',
    'Вынеси токен бота из x.ts в переменную окружения.',
  ],
  [
    'clean-up-todos',
    'Clean Up TODOs',
    'Resolve or remove the TODO comments in x.ts.',
    'Уборка TODO',
    'Реши или удали TODO-комментарии в x.ts.',
  ],
  [
    'remove-dead-code',
    'Remove Dead Code',
    'Delete x.ts: nothing imports it and it is not an entry point.',
    'Удаление мёртвого кода',
    'Удали x.ts: код нигде не импортируется и не является точкой входа.',
  ],
  [
    'split-large-file',
    'Split Large File',
    'Split x.ts into smaller modules.',
    'Разбиение большого файла',
    'Раздели x.ts на более мелкие модули.',
  ],
  [
    'break-import-cycle',
    'Break Import Cycle',
    'Break the import cycle through src/x.ts.',
    'Разрыв цикла импортов',
    'Разорви цикл импортов через src/x.ts.',
  ],
  [
    'remove-hardcoded-secret',
    'Remove Hardcoded Secret',
    'Move the secret out of x.ts and rotate it.',
    'Секрет в коде',
    'Вынеси секрет из x.ts и смени его.',
  ],
  [
    'deduplicate-code',
    'Deduplicate Code',
    'Extract the duplicated block in x.ts into one place.',
    'Устранение дублей',
    'Вынеси повторяющийся блок (x.ts) в одно место.',
  ],
  [
    'add-test-command',
    'Add Test Command',
    'Add a test script so the project can run its tests with one command.',
    'Команда для тестов',
    'Добавь скрипт test, чтобы тесты проекта запускались одной командой.',
  ],
  [
    'write-first-tests',
    'Write First Tests',
    'Add the first test file with at least 3 test cases.',
    'Первые тесты',
    'Добавь первый файл с тестами: не менее 3 тест-кейсов.',
  ],
  [
    'add-tests-for-module',
    'Add Tests for x',
    'Add tests for x.ts: at least 3 test cases that import it.',
    'Тесты для x',
    'Добавь тесты для x.ts: не менее 3 тест-кейсов, которые импортируют тестируемый код.',
  ],
  [
    'fix-failing-tests',
    'Fix Failing Tests',
    'Make the failing tests pass.',
    'Починка упавших тестов',
    'Сделай так, чтобы упавшие тесты проходили.',
  ],
  [
    'write-readme',
    'Write README',
    'Write a README of at least 10 lines: what the project does and how to run it.',
    'Написать README',
    'Напиши README не короче 10 строк: что делает проект и как его запустить.',
  ],
  [
    'document-environment',
    'Document Environment',
    'Add a .env.example that lists the environment variables the code reads.',
    'Описание окружения',
    'Добавь .env.example со списком переменных окружения, которые читает код.',
  ],
  [
    'lock-dependencies',
    'Lock Dependencies',
    'Commit a lock file so installs are reproducible.',
    'Фиксация зависимостей',
    'Закоммить lock-файл, чтобы установки были воспроизводимыми.',
  ],
  [
    'protect-env',
    'Protect .env',
    'Stop tracking .env in git and add it to .gitignore.',
    'Защита .env',
    'Перестань отслеживать .env в git и добавь его в .gitignore.',
  ],
  [
    'remove-suppressions',
    'Remove Suppressions',
    'Fix the problems hidden by suppression comments in x.ts.',
    'Убрать подавления',
    'Исправь проблемы, скрытые комментариями-подавлениями в x.ts.',
  ],
  [
    'revive-skipped-tests',
    'Revive Skipped Tests',
    'Re-enable the skipped tests in x.ts.',
    'Вернуть пропущенные тесты',
    'Включи обратно пропущенные тесты в x.ts.',
  ],
  [
    'handle-errors-in-file',
    'Handle Errors in x.ts',
    'Handle or log the swallowed errors in x.ts.',
    'Обработка ошибок в x.ts',
    'Обработай или залогируй проглоченные ошибки в x.ts.',
  ],
  [
    'sanitize-html',
    'Sanitize HTML',
    'Sanitize the HTML before it reaches dangerouslySetInnerHTML in x.ts.',
    'Очистка HTML',
    'Очищай HTML, прежде чем он попадёт в dangerouslySetInnerHTML в x.ts.',
  ],
  [
    'remove-eval',
    'Remove eval',
    'Replace dynamic code execution in x.ts with a safe alternative.',
    'Убрать eval',
    'Замени динамическое выполнение кода в x.ts безопасной альтернативой.',
  ],
  [
    'async-file-access',
    'Async File Access',
    'Use async file access inside the handlers of x.ts.',
    'Асинхронный доступ к файлам',
    'Используй асинхронный доступ к файлам внутри обработчиков в x.ts.',
  ],
  [
    'optimize-images',
    'Optimize Images',
    'Use next/image instead of a raw img tag in x.ts.',
    'Оптимизация картинок',
    'Используй next/image вместо обычного тега img в x.ts.',
  ],
  [
    'remove-debug-logs',
    'Remove Debug Logs',
    'Remove the console.log calls from x.ts.',
    'Убрать отладочные логи',
    'Убери вызовы console.log из x.ts.',
  ],
  [
    'fix-mutable-defaults',
    'Fix Mutable Defaults',
    'Replace mutable default arguments in x.ts with None.',
    'Изменяемые аргументы по умолчанию',
    'Замени изменяемые аргументы по умолчанию в x.ts на None.',
  ],
  [
    'unblock-the-event-loop',
    'Unblock the Event Loop',
    'Replace the blocking calls in async code of x.ts with async ones.',
    'Разблокировать цикл событий',
    'Замени блокирующие вызовы в асинхронном коде x.ts на асинхронные.',
  ],
];

describe('every template text, exactly', () => {
  const g: Group = { findings: [finding('src/x.ts', 'src/x.ts|src/y.ts')], files: ['src/x.ts'] };
  it('covers all templates', () => {
    expect(EXACT.map((row) => row[0])).toEqual(TEMPLATES.map((template) => template.id));
  });
  for (const [id, enTitle, enDesc, ruTitle, ruDesc] of EXACT) {
    it(id, () => {
      const vars = groupVars(g);
      expect(templateText('en', id, 'title', vars)).toBe(enTitle);
      expect(templateText('en', id, 'desc', vars)).toBe(enDesc);
      expect(templateText('ru', id, 'title', vars)).toBe(ruTitle);
      expect(templateText('ru', id, 'desc', vars)).toBe(ruDesc);
    });
  }
});

const tEpic = (lang: Lang, template: string, vars: Record<string, string | number>): string =>
  t(lang, `quest.${template}.title`, vars);

describe('epic texts', () => {
  it('render through the catalog in both languages', () => {
    const titles = 'A, B, C';
    expect(tEpic('en', 'epic-checkout-master', {})).toBe('Checkout Master');
    expect(tEpic('en', 'epic-command-center', {})).toBe('Command Center');
    expect(tEpic('en', 'epic-fortify', { dir: 'src/' })).toBe('Fortify src/');
    expect(t('en', 'quest.epic.desc', { n: 3, titles })).toBe('Finish all 3 quests: A, B, C.');
    expect(tEpic('ru', 'epic-checkout-master', {})).toBe('Мастер оформления заказа');
    expect(tEpic('ru', 'epic-command-center', {})).toBe('Командный центр');
    expect(tEpic('ru', 'epic-fortify', { dir: 'src/' })).toBe('Укрепление src/');
    expect(t('ru', 'quest.epic.desc', { n: 3, titles })).toBe('Выполни все 3 квеста: A, B, C.');
  });
});

const baseQuest = (over: Partial<Quest>): Quest =>
  ({
    id: 'a1b2c3d4e5f6',
    template: 't',
    pack: 'generic',
    title: 'T',
    description: 'D',
    category: 'cleanup',
    difficulty: 'easy',
    findings: ['f'],
    criteria: [],
    status: 'open',
    createdAt: '',
    baseline: {
      head: null,
      takenAt: '',
      findings: [],
      highFindings: [],
      testCasesTotal: 0,
      testCasesByModule: {},
      codeLines: 0,
      fileLines: {},
      botHandlers: 0,
      scripts: {},
    },
    ...over,
  }) as Quest;

describe('questTitle / questDescription', () => {
  it('English is the stored text; Russian is rendered from template and vars', () => {
    const q = baseQuest({
      template: 'clean-up-todos',
      title: 'Clean Up TODOs',
      description: 'Resolve or remove the TODO comments in a.ts.',
      vars: groupVars(group('src/a.ts')),
    });
    expect(questTitle(q, 'en')).toBe('Clean Up TODOs');
    expect(questTitle(q, 'ru')).toBe('Уборка TODO');
    expect(questDescription(q, 'ru')).toBe('Реши или удали TODO-комментарии в a.ts.');
  });

  it('a quest without vars, or with an unknown template, stays English', () => {
    const q = baseQuest({ template: 'clean-up-todos', title: 'Clean Up TODOs', description: 'D' });
    expect(questTitle(q, 'ru')).toBe('Clean Up TODOs');
    expect(questDescription(q, 'ru')).toBe('D');
    expect(questTitle(baseQuest({ template: 'no-such', title: 'X', vars: {} }), 'ru')).toBe('X');
  });

  it('an epic is worded from its subtasks and its directory', () => {
    const sub = (id: string, template: string) =>
      baseQuest({ id, template, title: id, vars: groupVars(group('src/a.ts')) });
    const epic = baseQuest({
      template: 'epic-fortify',
      title: 'Fortify src/',
      difficulty: 'epic',
      vars: { dir: 'src/' },
      subtasks: [sub('s1', 'clean-up-todos'), sub('s2', 'protect-env'), sub('s3', 'write-readme')],
    });
    expect(questTitle(epic, 'ru')).toBe('Укрепление src/');
    expect(questDescription(epic, 'ru')).toBe('Выполни все 3 квеста: Уборка TODO, Защита .env, Написать README.');
    const old = { ...epic, vars: undefined, template: 'epic-checkout-master', title: 'Checkout Master' };
    expect(questTitle(old, 'ru')).toBe('Мастер оформления заказа');
  });
});

describe('backfillVars', () => {
  it('fills vars of open quests from candidates with the same id, and of old epics from their template and title', () => {
    const vars = groupVars(group('src/a.ts'));
    const subtask = baseQuest({ id: 'sub1' });
    const plain = baseQuest({ id: 'plain', template: 'clean-up-todos' });
    const kept = baseQuest({ id: 'kept', template: 'clean-up-todos', vars: { sk: 'project' } });
    const orphan = baseQuest({ id: 'orphan', template: 'clean-up-todos' });
    const fortify = baseQuest({
      id: 'e1',
      template: 'epic-fortify',
      title: 'Fortify src/',
      difficulty: 'epic',
      subtasks: [subtask],
    });
    const checkout = baseQuest({ id: 'e2', template: 'epic-checkout-master', title: 'Checkout Master' });
    const center = baseQuest({ id: 'e3', template: 'epic-command-center', title: 'Command Center' });
    backfillVars(
      [plain, kept, orphan, fortify, checkout, center],
      [
        { quest: baseQuest({ id: 'plain', vars }) },
        { quest: baseQuest({ id: 'kept', vars }) },
        { quest: baseQuest({ id: 'sub1', vars }) },
      ],
    );
    expect(plain.vars).toEqual(vars);
    expect(subtask.vars).toEqual(vars);
    expect(kept.vars).toEqual({ sk: 'project' });
    expect(orphan.vars).toBeUndefined();
    expect(fortify.vars).toEqual({ dir: 'src/' });
    expect(checkout.vars).toEqual({});
    expect(center.vars).toEqual({});
  });
});
