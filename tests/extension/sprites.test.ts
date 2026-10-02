import { describe, expect, it } from 'vitest';
import { BOSS_IDS, bossSprite, CLASS_IDS, heroSprite, mirror } from '../../vscode-extension/src/shared/sprites.js';

const check = (sprite: { rows: string[]; palette: Record<string, string> }) => {
  const width = sprite.rows[0]?.length ?? 0;
  expect(width).toBeGreaterThan(0);
  for (const row of sprite.rows) {
    expect(row).toHaveLength(width);
    for (const key of row) if (key !== '.') expect(sprite.palette[key], `key ${key}`).toBeDefined();
  }
  for (const color of Object.values(sprite.palette)) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
};

describe('sprites', () => {
  it('mirror doubles a half row', () => {
    expect(mirror(['ab..'])).toEqual(['ab....ba']);
  });
  it('every hero (six classes and the neutral one) is a rectangle over its palette', () => {
    expect(CLASS_IDS).toEqual(['architect', 'tester', 'guardian', 'optimizer', 'cleaner', 'bug-hunter']);
    for (const id of [...CLASS_IDS, null, 'unknown-class', 'constructor']) check(heroSprite(id));
  });
  it('heroes of different classes look different', () => {
    const looks = new Set(
      CLASS_IDS.map((id) => heroSprite(id).rows.join('|') + JSON.stringify(heroSprite(id).palette)),
    );
    expect(looks.size).toBe(CLASS_IDS.length);
  });
  it('every boss theme and the generic one is a rectangle over its palette', () => {
    expect(BOSS_IDS).toEqual([
      'dark-forest',
      'graveyard',
      'clone-army',
      'secret-leak',
      'blind-spots',
      'breach',
      'todo-swamp',
    ]);
    for (const id of [...BOSS_IDS, 'from-the-future', 'constructor']) check(bossSprite(id));
  });
});
