import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/version.js';

describe('toolchain', () => {
  it('runs TypeScript ESM tests', () => {
    expect(VERSION).toBe('0.0.0');
  });
});
