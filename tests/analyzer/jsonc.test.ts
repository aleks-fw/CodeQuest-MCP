import { describe, expect, it } from 'vitest';
import { parseJsonc } from '../../src/analyzer/jsonc.js';

describe('parseJsonc', () => {
  it('drops line and block comments but keeps comment-like text inside strings', () => {
    const text = '{ // note\n "a": "http://x/*y*/", /* block */ "b": 1 }';
    expect(parseJsonc(text)).toEqual({ a: 'http://x/*y*/', b: 1 });
  });

  it('honours escaped quotes inside strings', () => {
    expect(parseJsonc('{"a": "say \\"hi\\" // not a comment"}')).toEqual({ a: 'say "hi" // not a comment' });
  });

  it('removes trailing commas in objects and arrays', () => {
    expect(parseJsonc('{"a": [1, 2,], "b": {"c": 3,},}')).toEqual({ a: [1, 2], b: { c: 3 } });
  });

  it('keeps a comma that is inside a string, even right before a closing bracket', () => {
    expect(parseJsonc('{"a": "x,}"}')).toEqual({ a: 'x,}' });
    expect(parseJsonc('{"scripts": {"test": "echo done,]"}}')).toEqual({ scripts: { test: 'echo done,]' } });
  });

  it('still removes a real trailing comma after a string value', () => {
    expect(parseJsonc('{"a": "b",}')).toEqual({ a: 'b' });
  });

  it('throws on invalid JSON', () => {
    expect(() => parseJsonc('{ a: 1 }')).toThrow();
  });
});
