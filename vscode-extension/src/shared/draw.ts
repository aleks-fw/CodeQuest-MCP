import { backgroundTier, bossRatio, type EffectKind } from './scene.js';
import { bossSprite, heroSprite, type Sprite } from './sprites.js';
import type { StateDoc } from './state.js';

export const SCENE_W = 160;
export const SCENE_H = 64;
export const EFFECT_MS = 1200;
const GROUND = 52;

/** The part of CanvasRenderingContext2D the scene needs (so it can be tested without a DOM). */
export interface Ctx2D {
  fillStyle: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
}

export interface SceneInput {
  doc: StateDoc | null;
  effects: { kind: EffectKind; startedAt: number }[];
}

const TIERS = [
  { sky: '#9bd1f2', far: '#7fb069', near: '#4f8a3c', trunk: '#6b4a2b', leaf: '#3f7d34' },
  { sky: '#e9b872', far: '#b9803a', near: '#8a5a2b', trunk: '#5a3b1e', leaf: '#c9792b' },
  { sky: '#2b2540', far: '#4a3f6b', near: '#2f2a4a', trunk: '#241f38', leaf: '#6b5aa8' },
] as const;

/** A filled rectangle clamped to the scene: nothing is ever drawn outside it. */
function pixel(ctx: Ctx2D, color: string, x: number, y: number, w = 1, h = 1): void {
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(SCENE_W, Math.floor(x + w));
  const bottom = Math.min(SCENE_H, Math.floor(y + h));
  if (right <= left || bottom <= top) return;
  ctx.fillStyle = color;
  ctx.fillRect(left, top, right - left, bottom - top);
}

function blit(ctx: Ctx2D, sprite: Sprite, x: number, y: number, flip = false): void {
  sprite.rows.forEach((row, dy) => {
    const cells = flip ? [...row].reverse() : [...row];
    cells.forEach((key, dx) => {
      const color = key === '.' ? undefined : sprite.palette[key];
      if (color !== undefined) pixel(ctx, color, x + dx, y + dy);
    });
  });
}

function background(ctx: Ctx2D, tier: 0 | 1 | 2): void {
  const c = TIERS[tier];
  pixel(ctx, c.sky, 0, 0, SCENE_W, SCENE_H);
  pixel(ctx, c.far, 0, 38, SCENE_W, 14);
  pixel(ctx, c.near, 0, GROUND, SCENE_W, SCENE_H - GROUND);
  for (const x of [8, 40, 96, 128]) {
    pixel(ctx, c.trunk, x + 3, 30, 3, 22);
    pixel(ctx, c.leaf, x, 20, 9, 12);
  }
}

/** One frame of the scene; `time` is in milliseconds. Pure drawing: no state, no DOM. */
export function drawScene(ctx: Ctx2D, input: SceneInput, time: number): void {
  const { doc } = input;
  background(ctx, backgroundTier(doc?.level ?? 1));
  const step = Math.floor(time / 250);
  const bob = step % 2;
  const heroX = 30 + (doc !== null && doc.boss === null ? (step % 8) * 2 : 0);
  blit(ctx, heroSprite(doc?.class?.id ?? null), heroX, GROUND - 14 - bob);
  if (doc !== null && doc.boss !== null) {
    const boss = doc.boss;
    blit(ctx, bossSprite(boss.id), 104, GROUND - 10 + bob, true);
    pixel(ctx, '#1b1b1b', 102, 30, 34, 4);
    pixel(ctx, '#d94a4a', 103, 31, Math.round(32 * bossRatio(boss)), 2);
  }
  for (const effect of input.effects) {
    const age = time - effect.startedAt;
    if (age < 0 || age >= EFFECT_MS) continue;
    const t = age / EFFECT_MS;
    if (effect.kind === 'levelup') {
      for (let i = 0; i < 6; i++) {
        pixel(ctx, '#ffe066', heroX + 2 + i * 2, GROUND - 18 - Math.round(t * 14) - (i % 2) * 3, 2, 2);
      }
    } else if (effect.kind === 'quest') {
      for (let i = 0; i < 5; i++) {
        pixel(ctx, '#7cfc9a', heroX - 2 + i * 3, GROUND - 4 - Math.round(t * 10) + (i % 2) * 2, 1, 2);
      }
    } else if (effect.kind === 'boss_hit') {
      if (Math.floor(age / 120) % 2 === 0) pixel(ctx, '#ffffff', 104, GROUND - 10, 12, 10);
    } else {
      for (let i = 0; i < 8; i++) {
        pixel(ctx, '#ff9f43', 104 + i * 2, GROUND - 4 - Math.round(t * 18) - (i % 3) * 2, 2, 2);
      }
    }
  }
}
