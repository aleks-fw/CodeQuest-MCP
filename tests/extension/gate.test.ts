import { describe, expect, it } from 'vitest';
import { createGate } from '../../vscode-extension/src/shared/gate.js';

describe('createGate', () => {
  it('skips a job while another one is running and runs again after it', async () => {
    const gate = createGate();
    let release: () => void = () => {};
    const first = gate.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    expect(gate.busy).toBe(true);
    expect(await gate.run(async () => {})).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(gate.busy).toBe(false);
    expect(await gate.run(async () => {})).toBe(true);
  });
  it('is free again after a job that throws, and passes the error on', async () => {
    const gate = createGate();
    await expect(
      gate.run(async () => {
        throw new Error('x');
      }),
    ).rejects.toThrow('x');
    expect(gate.busy).toBe(false);
  });
});
