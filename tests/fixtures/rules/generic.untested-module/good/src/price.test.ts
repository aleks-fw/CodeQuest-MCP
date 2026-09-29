import assert from 'node:assert/strict';
import { test } from 'node:test';
import { priceWithTax } from './price.js';

test('adds 20% tax', () => {
  assert.equal(priceWithTax(1000), 1200);
});
