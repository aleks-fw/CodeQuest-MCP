import { describe, expect, it } from 'vitest';
import { type Ctx2D, drawScene, SCENE_H, SCENE_W } from '../../vscode-extension/src/shared/draw.js';
import { parseState } from '../../vscode-extension/src/shared/state.js';

function recorder() {
  const calls: { color: string; x: number; y: number; w: number; h: number }[] = [];
  const ctx: Ctx2D = {
    fillStyle: '#000000',
    fillRect(x, y, w, h) {
      calls.push({ color: this.fillStyle, x, y, w, h });
    },
    clearRect() {},
  };
  return { ctx, calls };
}
const doc = (over: Record<string, unknown> = {}) => parseState({ version: 1, level: 3, ...over });

describe('drawScene', () => {
  it('draws only inside the scene, for every tier and with or without a document', () => {
    for (const input of [
      { doc: null, effects: [] },
      { doc: doc(), effects: [] },
      { doc: doc({ level: 12, class: { id: 'tester', name: 'T' } }), effects: [] },
      { doc: doc({ level: 40, boss: { id: 'breach', name: 'B', hp: 3, max: 5 }, bossesActive: 1 }), effects: [] },
    ]) {
      const { ctx, calls } = recorder();
      drawScene(ctx, input, 1234);
      expect(calls.length).toBeGreaterThan(10);
      for (const c of calls) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w).toBeLessThanOrEqual(SCENE_W);
        expect(c.y + c.h).toBeLessThanOrEqual(SCENE_H);
      }
    }
  });

  it('draws more with a boss than without, and effects add pixels without leaving the scene', () => {
    const plain = recorder();
    drawScene(plain.ctx, { doc: doc(), effects: [] }, 0);
    const withBoss = recorder();
    drawScene(
      withBoss.ctx,
      { doc: doc({ boss: { id: 'graveyard', name: 'G', hp: 4, max: 8 }, bossesActive: 1 }), effects: [] },
      0,
    );
    expect(withBoss.calls.length).toBeGreaterThan(plain.calls.length);
    const fx = recorder();
    drawScene(
      fx.ctx,
      {
        doc: doc(),
        effects: [
          { kind: 'levelup', startedAt: 0 },
          { kind: 'quest', startedAt: 0 },
        ],
      },
      200,
    );
    expect(fx.calls.length).toBeGreaterThan(plain.calls.length);
    for (const c of fx.calls) expect(c.x + c.w).toBeLessThanOrEqual(SCENE_W);
  });

  it('shows a finished effect as nothing', () => {
    const base = recorder();
    drawScene(base.ctx, { doc: doc(), effects: [] }, 5000);
    const old = recorder();
    drawScene(old.ctx, { doc: doc(), effects: [{ kind: 'levelup', startedAt: 0 }] }, 5000);
    expect(old.calls.length).toBe(base.calls.length);
  });
});
