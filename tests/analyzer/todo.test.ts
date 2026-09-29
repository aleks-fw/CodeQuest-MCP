import { describe, expect, it } from 'vitest';
import { todoRule } from '../../src/analyzer/rules/todo.js';
import { runRule } from '../helpers/rule-context.js';

describe('generic/todo', () => {
  it('reads markers from JS, Python, HTML and CSS comments only', () => {
    const hits = runRule(todoRule, {
      'src/a.ts': '// TODO: Handle   Discounts\nconst todo = "TODO";\n',
      'bot.py': 'x = 1  # FIXME retry\n',
      'index.html': '<!-- HACK: inline styles -->\n',
      'style.css': '/* XXX - legacy grid */\n',
      'notes.md': '// TODO: not code\n',
    });
    expect(hits).toEqual([
      { file: 'bot.py', line: 1, message: 'FIXME: retry', key: 'FIXME:retry' },
      { file: 'index.html', line: 1, message: 'HACK: inline styles', key: 'HACK:inline styles' },
      { file: 'src/a.ts', line: 1, message: 'TODO: Handle   Discounts', key: 'TODO:handle discounts' },
      { file: 'style.css', line: 1, message: 'XXX: legacy grid', key: 'XXX:legacy grid' },
    ]);
  });

  it('ignores words that only contain a marker', () => {
    expect(runRule(todoRule, { 'src/a.ts': '// TODOS and autodoc\n' })).toEqual([]);
  });
});
