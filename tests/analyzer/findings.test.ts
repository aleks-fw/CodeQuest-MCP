import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { findingId, lineKey, toFindings } from '../../src/analyzer/findings.js';
import type { Rule } from '../../src/analyzer/rules/types.js';

const rule: Rule = { id: 'generic/todo', category: 'clean-code', severity: 'low', run: () => [] };

describe('findingId', () => {
  it('is the first 16 hex chars of sha256(rule \\n file \\n key), file "" when absent', () => {
    const expected = createHash('sha256').update('generic/todo\nsrc/a.ts\nTODO:x').digest('hex').slice(0, 16);
    expect(findingId('generic/todo', 'src/a.ts', 'TODO:x')).toBe(expected);
    expect(findingId('generic/no-readme', undefined, '')).toBe(findingId('generic/no-readme', '', ''));
  });
});

describe('lineKey', () => {
  it('trims and collapses whitespace', () => {
    expect(lineKey('  } catch (e)\t{   }  ')).toBe('} catch (e) { }');
  });
});

describe('toFindings', () => {
  it('numbers repeated keys per file in hit order, so ids do not depend on line numbers', () => {
    const findings = toFindings(rule, [
      { file: 'a.ts', line: 1, message: 'm', key: 'k' },
      { file: 'a.ts', line: 9, message: 'm', key: 'k' },
      { file: 'b.ts', line: 2, message: 'm', key: 'k' },
      { file: 'a.ts', line: 20, message: 'm', key: 'k' },
    ]);
    expect(findings.map((finding) => finding.key)).toEqual(['k', 'k#2', 'k', 'k#3']);
    expect(findings[0]?.id).toBe(findingId('generic/todo', 'a.ts', 'k'));
    const moved = toFindings(rule, [{ file: 'a.ts', line: 50, message: 'm', key: 'k' }]);
    expect(moved[0]?.id).toBe(findings[0]?.id);
  });

  it('takes category and severity from the rule unless the hit overrides severity', () => {
    const findings = toFindings(rule, [
      { message: 'no file', key: '' },
      { file: 'a.ts', line: 3, message: 'x', key: 'y', severity: 'high' },
    ]);
    expect(findings).toEqual([
      {
        id: findingId('generic/todo', undefined, ''),
        rule: 'generic/todo',
        category: 'clean-code',
        severity: 'low',
        message: 'no file',
        key: '',
      },
      {
        id: findingId('generic/todo', 'a.ts', 'y'),
        rule: 'generic/todo',
        category: 'clean-code',
        severity: 'high',
        file: 'a.ts',
        line: 3,
        message: 'x',
        key: 'y',
      },
    ]);
    expect(findings[0]).not.toHaveProperty('file');
    expect(findings[0]).not.toHaveProperty('line');
  });
});
