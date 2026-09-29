import { describe, expect, it } from 'vitest';
import type { SourceFile } from '../../src/analyzer/files.js';
import { findDuplicateBlocks, significantLines } from '../../src/analyzer/rules/duplicate-block.js';
import { sourceFiles } from '../helpers/source-files.js';

const BLOCK = [
  '  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);',
  '  const discount = coupon ? subtotal * coupon.rate : 0;',
  '  const taxable = subtotal - discount;',
  '  const tax = Math.round(taxable * 0.2);',
  '  const shipping = taxable > 100 ? 0 : 10;',
  '  const total = taxable + tax + shipping;',
  '  audit.push({ subtotal, discount, tax, shipping });',
  '  return total;',
];

function source(lines: string[]): string {
  return `${lines.join('\n')}\n`;
}

function only(content: string): SourceFile {
  const [file] = sourceFiles({ 'src/x.ts': content });
  if (!file) throw new Error('sourceFiles returned nothing');
  return file;
}

describe('significantLines', () => {
  it('drops blank, comment, import, require and punctuation-only lines and collapses spaces', () => {
    const file = only(
      source([
        "import a from 'a';",
        "export { b } from './b.js';",
        "const c = require('c');",
        '',
        '// note',
        '});',
        'const d = 1;',
        '  let   e =  2;',
      ]),
    );
    expect(significantLines(file)).toEqual([
      { line: 7, text: 'const d = 1;' },
      { line: 8, text: 'let e = 2;' },
    ]);
  });
});

describe('findDuplicateBlocks', () => {
  it('reports a block shared by two files once, at the first file, ignoring comments and imports', () => {
    const a = source([
      'export function totalA(items, coupon) {',
      ...BLOCK.slice(0, 3),
      '  // keep in sync with billing',
      ...BLOCK.slice(3),
      '}',
    ]);
    const b = source([
      "import { audit } from './audit.js';",
      '',
      'export function totalB(items, coupon) {',
      ...BLOCK,
      '}',
    ]);
    expect(findDuplicateBlocks(sourceFiles({ 'src/a.ts': a, 'src/b.ts': b }))).toEqual([
      {
        file: 'src/a.ts',
        line: 2,
        message: 'Duplicated block also at src/b.ts:4',
        key: expect.stringMatching(/^[0-9a-f]{16}$/),
      },
    ]);
  });

  it('ignores blocks shorter than 8 significant lines', () => {
    const a = source(['export function totalA(items, coupon) {', ...BLOCK.slice(0, 7), '  return 1;', '}']);
    const b = source(['export function totalB(items, coupon) {', ...BLOCK.slice(0, 7), '  return 2;', '}']);
    expect(findDuplicateBlocks(sourceFiles({ 'src/a.ts': a, 'src/b.ts': b }))).toEqual([]);
  });

  it('finds a block repeated inside one file', () => {
    const a = source([
      'export function totalA(items, coupon) {',
      ...BLOCK,
      '}',
      'export function totalB(items, coupon) {',
      ...BLOCK,
      '}',
    ]);
    const hits = findDuplicateBlocks(sourceFiles({ 'src/a.ts': a }));
    expect(hits.map((hit) => [hit.file, hit.line, hit.message])).toEqual([
      ['src/a.ts', 2, 'Duplicated block also at src/a.ts:12'],
    ]);
  });

  it('does not look at test files', () => {
    const a = source(['export function totalA(items, coupon) {', ...BLOCK, '}']);
    const b = source(['export function totalB(items, coupon) {', ...BLOCK, '}']);
    expect(findDuplicateBlocks(sourceFiles({ 'src/a.test.ts': a, 'src/b.test.ts': b }))).toEqual([]);
  });
});
