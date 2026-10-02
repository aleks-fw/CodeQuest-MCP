import { describe, expect, it } from 'vitest';
import { parseCliOutput, parseState } from '../../vscode-extension/src/shared/state.js';

const good = {
  version: 1,
  lang: 'en',
  project: { name: 'shop', path: 'D:/x' },
  level: 2,
  xp: { current: 475, forLevel: 500, max: false },
  title: 'APPRENTICE',
  stats: {
    architecture: 70,
    testing: 40,
    security: 90,
    performance: 80,
    cleanCode: 60,
    reliability: 50,
    maintainability: 55,
    bugs: 30,
    techDebt: 20,
  },
  class: { id: 'tester', name: 'Tester' },
  busy: false,
  owed: { count: 1, xp: 60 },
  quests: { open: 3, done: 2, inProgress: [{ id: 'a', title: 'Fix', difficulty: 'hard' }] },
  boss: { id: 'graveyard', name: 'Graveyard', hp: 5, max: 9 },
  bossesActive: 1,
};

describe('parseState', () => {
  it('keeps a good document as it is', () => {
    expect(parseState(good)).toEqual(good);
  });

  it('turns wrong types into safe values and never throws', () => {
    const doc = parseState({
      version: 1,
      level: 'x',
      xp: 5,
      quests: null,
      boss: { id: 3 },
      stats: { testing: 'a', security: 120 },
      lang: 'de',
    });
    expect(doc).not.toBeNull();
    expect(doc?.level).toBe(1);
    expect(doc?.xp).toEqual({ current: 0, forLevel: 500, max: false });
    expect(doc?.quests).toEqual({ open: 0, done: 0, inProgress: [] });
    expect(doc?.boss).toBeNull();
    expect(doc?.stats.testing).toBe(0);
    expect(doc?.stats.security).toBe(100);
    expect(doc?.lang).toBe('en');
  });

  it('returns null for something that is not a version-1 document', () => {
    for (const raw of [null, 5, 'x', [], {}, { version: 2 }]) expect(parseState(raw)).toBeNull();
  });
});

describe('parseCliOutput', () => {
  it('parses a document from the last non-empty line', () => {
    const result = parseCliOutput(`noise\n${JSON.stringify(good)}\n`);
    expect(result.ok).toBe(true);
  });

  it('turns an error document into its message', () => {
    expect(parseCliOutput('{"error":{"key":"k","message":"No project here"}}\n')).toEqual({
      ok: false,
      message: 'No project here',
    });
  });

  it('turns garbage and empty output into a readable message', () => {
    for (const text of ['', '\n', 'not json', '{"a":1}']) {
      const result = parseCliOutput(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
    }
  });
});
