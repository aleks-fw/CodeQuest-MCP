import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPrice } from './format.ts';

test('formats whole amounts', () => {
  assert.equal(formatPrice(500), '5.00 USD');
});

test('pads cents', () => {
  assert.equal(formatPrice(1205), '12.05 USD');
});

test('formats zero', () => {
  assert.equal(formatPrice(0), '0.00 USD');
});
