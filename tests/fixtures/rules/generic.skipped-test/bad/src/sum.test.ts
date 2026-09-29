import { expect, it } from 'vitest';
import { sum } from './sum.js';

it('adds numbers', () => {
  expect(sum(1, 2)).toBe(3);
});

it.skip('handles negative numbers', () => {
  expect(sum(-1, -2)).toBe(-3);
});
