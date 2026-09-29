import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPrice } from './format.ts';

test('formats cents as dollars', () => {
  assert.equal(formatPrice(1999), '$19.99');
});

test('formats zero', () => {
  assert.equal(formatPrice(0), '$0.00');
});
