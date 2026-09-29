import { describe, expect, it } from 'vitest';
import { countBotHandlers } from '../../src/analyzer/metrics.js';
import { pyBareExceptRule } from '../../src/analyzer/rules/py-bare-except.js';
import { pyBlockingInAsyncRule } from '../../src/analyzer/rules/py-blocking-in-async.js';
import { pyEvalRule } from '../../src/analyzer/rules/py-eval.js';
import { pyMutableDefaultRule } from '../../src/analyzer/rules/py-mutable-default.js';
import { runRule } from '../helpers/rule-context.js';
import { sourceFiles } from '../helpers/source-files.js';

const hitsOf = (hits: { line?: number; key: string }[]) => hits.map((hit) => [hit.line, hit.key]);

describe('py/bare-except', () => {
  it('flags except: only, not named exceptions, comments or non-Python files', () => {
    const hits = runRule(pyBareExceptRule, {
      'a.py': [
        'try:',
        '    run()',
        'except:',
        '    pass',
        'try:',
        '    run()',
        'except Exception:',
        '    pass',
        '# except:',
      ].join('\n'),
      'b.ts': 'except:\n',
    });
    expect(hitsOf(hits)).toEqual([[3, 'except:']]);
    expect(hits[0]?.file).toBe('a.py');
  });
});

describe('py/eval', () => {
  it('flags eval( and exec( but not literal_eval, methods or comments', () => {
    const hits = runRule(pyEvalRule, {
      'a.py': [
        'x = eval(text)',
        'exec(code)',
        'y = ast.literal_eval(text)',
        'z = pattern.exec(text)',
        'w = my_eval(text)',
        '# eval(text)',
      ].join('\n'),
    });
    expect(hitsOf(hits)).toEqual([
      [1, 'x = eval(text)'],
      [2, 'exec(code)'],
    ]);
  });
});

describe('py/mutable-default', () => {
  it('flags [], {}, set(), list(), dict() defaults, also annotated, keyword-only and multi-line', () => {
    const hits = runRule(pyMutableDefaultRule, {
      'a.py': [
        'def a(x=[]): pass',
        'def b(x, y: dict[str, int] = {}): pass',
        'def c(*, seen=set()): pass',
        'def d(',
        '    first,',
        '    items: list = list(),',
        '    other=dict(),',
        '): pass',
        'async def e(self, cache={}): pass',
      ].join('\n'),
    });
    expect(hitsOf(hits)).toEqual([
      [1, 'a(x)'],
      [2, 'b(y)'],
      [3, 'c(seen)'],
      [6, 'd(items)'],
      [7, 'd(other)'],
      [9, 'e(cache)'],
    ]);
  });

  it('ignores None, tuples, non-empty literals, calls with arguments and commented defs', () => {
    const hits = runRule(pyMutableDefaultRule, {
      'a.py': [
        'def a(x=None, y=(), z=[1], w=list(range(3)), v="[]"): pass',
        '# def b(x=[]): pass',
        'def c(x): return [x]',
      ].join('\n'),
    });
    expect(hits).toEqual([]);
  });

  it('stays fast when def ( is never closed', () => {
    const content = 'def broken(a, b, c\n'.repeat(20_000);
    const started = performance.now();
    expect(runRule(pyMutableDefaultRule, { 'a.py': content })).toEqual([]);
    expect(performance.now() - started, 'mutable-default time').toBeLessThan(2000);
  });
});

describe('py/blocking-in-async', () => {
  it('flags time.sleep and requests.* inside async def only', () => {
    const hits = runRule(pyBlockingInAsyncRule, {
      'a.py': [
        'import time',
        'import requests',
        '',
        'def sync_worker():',
        '    time.sleep(1)',
        '    return requests.get(URL)',
        '',
        'async def handler(message):',
        '    time.sleep(1)',
        '    data = requests.get(URL).json()',
        '    await asyncio.sleep(1)',
        '    return data',
        '',
        'x = 1',
      ].join('\n'),
    });
    expect(hitsOf(hits)).toEqual([
      [9, 'handler:time.sleep'],
      [10, 'handler:requests.get'],
    ]);
  });

  it('skips nested sync defs and to_thread arguments, and reports each line once', () => {
    const hits = runRule(pyBlockingInAsyncRule, {
      'a.py': [
        'async def outer():',
        '    def blocking():',
        '        time.sleep(1)',
        '        return requests.post(URL)',
        '    await asyncio.to_thread(blocking)',
        '    await asyncio.to_thread(requests.get, URL)',
        '    async def inner():',
        '        requests.delete(URL)',
        '    await inner()',
      ].join('\n'),
    });
    expect(hitsOf(hits)).toEqual([[8, 'outer:requests.delete']]);
  });
});

describe('countBotHandlers for Python', () => {
  it('counts aiogram, python-telegram-bot, Pyrogram and Telethon registrations', () => {
    const files = sourceFiles({
      'bot.py': [
        '@dp.message(Command("start"))',
        'async def start(m): ...',
        '@router.callback_query(F.data == "x")',
        'async def cb(c): ...',
        'dp.message.register(echo)',
        'app.add_handler(CommandHandler("help", help_cmd))',
        'app.add_handler(MessageHandler(filters.TEXT, echo))',
        '@app.on_message(filters.private)',
        '@client.on(events.NewMessage)',
        'from telegram.ext import CommandHandler',
        'bot = Bot(token)',
      ].join('\n'),
      'tests/test_bot.py': '@dp.message()\n',
    });
    expect(countBotHandlers(files)).toBe(7);
  });
});
