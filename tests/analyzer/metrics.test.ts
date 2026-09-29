import { describe, expect, it } from 'vitest';
import { countBotHandlers, measureLines } from '../../src/analyzer/metrics.js';
import { sourceFiles } from '../helpers/source-files.js';

describe('measureLines', () => {
  it('counts lines of code and test files and non-blank lines of code', () => {
    const files = sourceFiles({
      'src/a.ts': 'const a = 1;\n\n  \nconst b = 2;\n',
      'src/a.test.ts': "it('x', () => {});\n",
      'src/b.py': 'x = 1\n',
      'vite.config.ts': 'export default {};\n',
      'README.md': '# x\n',
    });
    expect(measureLines(files)).toEqual({
      codeLines: 3,
      fileLines: { 'src/a.test.ts': 1, 'src/a.ts': 4, 'src/b.py': 1 },
    });
  });
});

describe('countBotHandlers', () => {
  it('counts handler registrations in JS/TS code files only', () => {
    const files = sourceFiles({
      'src/bot.ts': [
        "bot.start((ctx) => ctx.reply('hi'));",
        "bot.help((ctx) => ctx.reply('help'));",
        "bot.command('ban', ban);",
        'bot.hears(/hello/, greet);',
        "bot.on('text', echo);",
        "composer.action('ok', ok);",
        'router.onText(/\\/echo/, echo);',
        'bot.launch();',
        "robot.on('x', y);",
      ].join('\n'),
      'src/bot.test.ts': "bot.command('x', y);\n",
      'scripts/bot.py': "bot.command('x')\n",
    });
    expect(countBotHandlers(files)).toBe(7);
  });
});
