import assert from 'node:assert/strict';
import { test } from 'node:test';
import { greet } from './app.js';

test('greets by name', () => {
  assert.equal(greet('Ann'), 'Hello, Ann!');
});
