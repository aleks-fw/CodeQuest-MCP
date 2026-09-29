import { describe, expect, it } from 'vitest';
import { lineKey } from '../../src/analyzer/findings.js';
import { emptyCatchRule } from '../../src/analyzer/rules/empty-catch.js';
import { jsDebugLogRule } from '../../src/analyzer/rules/js-debug-log.js';
import { jsEvalRule } from '../../src/analyzer/rules/js-eval.js';
import { largeFileRule } from '../../src/analyzer/rules/large-file.js';
import { skippedTestRule } from '../../src/analyzer/rules/skipped-test.js';
import { suppressionRule } from '../../src/analyzer/rules/suppression.js';
import { runRule } from '../helpers/rule-context.js';

describe('generic/suppression', () => {
  it.each([
    ['ts-ignore', 'src/a.ts', '// @ts-ignore'],
    ['ts-nocheck', 'src/a.ts', '// @ts-nocheck'],
    ['eslint-disable', 'src/a.ts', '/* eslint-disable no-console */'],
    ['noqa', 'app.py', 'import os  # noqa: F401'],
    ['type-ignore', 'app.py', 'x: int = "a"  # type: ignore'],
    ['istanbul', 'src/a.ts', '/* istanbul ignore next */'],
    ['no-cover', 'app.py', 'if DEBUG:  # pragma: no cover'],
  ] as const)('finds %s', (name, file, line) => {
    expect(runRule(suppressionRule, { [file]: `${line}\n` })).toEqual([
      { file, line: 1, message: `Suppression comment hides a problem: ${name}`, key: `${name}:${lineKey(line)}` },
    ]);
  });

  it('ignores documentation and other non-code files', () => {
    expect(runRule(suppressionRule, { 'README.md': 'Avoid // @ts-ignore\n' })).toEqual([]);
  });
});

describe('generic/skipped-test', () => {
  it.each([
    ['src/a.test.ts', "it.skip('a', () => {});"],
    ['src/a.test.ts', "  xit('a', () => {});"],
    ['src/a.spec.js', "describe.skip('suite', () => {});"],
    ['src/a.test.ts', "xtest('a', () => {});"],
    ['tests/test_a.py', '@pytest.mark.skip(reason="flaky")'],
    ['tests/test_a.py', '@unittest.skip("later")'],
  ] as const)('finds a skip in %s: %s', (file, line) => {
    expect(runRule(skippedTestRule, { [file]: `${line}\n` })).toEqual([
      { file, line: 1, message: `Skipped test: ${lineKey(line)}`, key: lineKey(line) },
    ]);
  });

  it('looks only at test files and real calls', () => {
    const hits = runRule(skippedTestRule, {
      'src/a.ts': "it.skip('a', () => {});\n",
      'src/b.test.ts': "it('a', () => { process.exit(0); });\nconst box = maxit(1);\n// it.skip('old')\n",
    });
    expect(hits).toEqual([]);
  });
});

describe('generic/empty-catch', () => {
  it('reports the catch line in a CRLF file', () => {
    const content = 'export function f(): void {\r\n  try {\r\n    run();\r\n  } catch (error) {\r\n  }\r\n}\r\n';
    expect(runRule(emptyCatchRule, { 'src/a.ts': content })).toEqual([
      { file: 'src/a.ts', line: 4, message: 'Empty catch block swallows the error', key: '} catch (error) {' },
    ]);
  });

  it('finds except … pass in a CRLF Python file', () => {
    const content = 'try:\r\n    run()\r\nexcept ValueError:\r\n    pass\r\n';
    expect(runRule(emptyCatchRule, { 'app.py': content })).toEqual([
      { file: 'app.py', line: 3, message: 'Exception silenced with pass', key: 'except ValueError:' },
    ]);
  });

  it('ignores handlers that do something and promise .catch callbacks', () => {
    const hits = runRule(emptyCatchRule, {
      'src/a.ts': 'try { run(); } catch (error) { log(error); }\npromise.catch(() => {});\n',
      'app.py': 'try:\n    run()\nexcept ValueError:\n    log()\n',
    });
    expect(hits).toEqual([]);
  });
});

describe('generic/large-file', () => {
  it('flags code and test files over 400 lines: medium, over 800: high', () => {
    const lines = (count: number): string => 'x\n'.repeat(count);
    const hits = runRule(largeFileRule, {
      'src/ok.ts': lines(400),
      'src/big.ts': lines(401),
      'src/huge.test.ts': lines(801),
      'data.json': lines(900),
    });
    expect(hits).toEqual([
      { file: 'src/big.ts', message: 'File has 401 lines (limit 400)', key: 'size', severity: 'medium' },
      { file: 'src/huge.test.ts', message: 'File has 801 lines (limit 400)', key: 'size', severity: 'high' },
    ]);
  });
});

describe('js/eval', () => {
  it('flags eval and new Function in code and config files', () => {
    const hits = runRule(jsEvalRule, {
      'src/a.ts': 'const f = new Function("a", "return a");\n',
      'vite.config.js': 'eval(source);\n',
    });
    expect(hits).toEqual([
      {
        file: 'src/a.ts',
        line: 1,
        message: 'Dynamic code execution: const f = new Function("a", "return a");',
        key: 'const f = new Function("a", "return a");',
      },
      { file: 'vite.config.js', line: 1, message: 'Dynamic code execution: eval(source);', key: 'eval(source);' },
    ]);
  });

  it('skips comments, method calls, tests and non-JS files', () => {
    const hits = runRule(jsEvalRule, {
      'src/a.ts': '// eval(x) is banned\nconst r = sandbox.eval(code);\nconst evaluate = 1;\n',
      'src/a.test.ts': 'eval(x);\n',
      'app.py': 'eval(x)\n',
    });
    expect(hits).toEqual([]);
  });
});

describe('js/debug-log', () => {
  it('flags console.log in code', () => {
    expect(runRule(jsDebugLogRule, { 'src/server.ts': 'console.log("started");\n' })).toEqual([
      { file: 'src/server.ts', line: 1, message: 'console.log left in code', key: 'console.log("started");' },
    ]);
  });

  it('skips scripts, bin, tests, comments and other console methods', () => {
    const hits = runRule(jsDebugLogRule, {
      'scripts/seed.ts': 'console.log(1);\n',
      'bin/cli.js': 'console.log(1);\n',
      'src/a.test.ts': 'console.log(1);\n',
      'src/b.ts': '// console.log(1);\nconsole.error(1);\n',
    });
    expect(hits).toEqual([]);
  });
});
