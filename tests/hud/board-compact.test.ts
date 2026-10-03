import { describe, expect, it } from 'vitest';
import { COMPACT_ROWS, renderCompact } from '../../src/hud/board-compact.js';
import type { Quest } from '../../src/types.js';

function quest(id: string, overrides: Partial<Quest> = {}): Quest {
  return {
    id,
    template: 't',
    pack: 'shop',
    title: `Quest ${id}`,
    description: 'd',
    category: 'cleanup',
    difficulty: 'easy',
    findings: ['f'],
    criteria: [{ type: 'no_regressions', params: {} }],
    status: 'open',
    createdAt: '',
    baseline: {
      head: null,
      takenAt: '',
      findings: [],
      highFindings: [],
      testCasesTotal: 0,
      testCasesByModule: {},
      codeLines: 0,
      fileLines: {},
      botHandlers: 0,
      scripts: {},
    },
    ...overrides,
  };
}

const options = { xp: 3990, width: 100, lang: 'en' as const };

describe('the compact board', () => {
  it('switches on below ten rows', () => {
    expect(COMPACT_ROWS).toBe(10);
  });

  it('is two lines: the status, then the quest under the cursor', () => {
    const lines = renderCompact([quest('a'), quest('b')], { mode: 'list', index: 1 }, options);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('◆ LVL 7 · ANALYST · 240/800 XP ███░░░░░░░ · 2 open');
    expect(lines[1]).toContain('▶ Quest b');
    expect(lines[1]).toContain('Easy +');
    expect(lines[1]).toContain('XP');
  });

  it('marks a quest in work, and shows a message instead of the quest', () => {
    const taken = quest('a', { acceptedAt: '2026-10-03T00:00:00.000Z' });
    expect(renderCompact([taken], { mode: 'list', index: 0 }, options)[1]).toMatch(/^● Quest a/);
    const lines = renderCompact([taken], { mode: 'list', index: 0, message: 'Checking…\nsecond line' }, options);
    expect(lines[1]).toBe('Checking…');
  });

  it('the card line carries the keys of the card; no quests says so', () => {
    const open = renderCompact([quest('a')], { mode: 'card', index: 0, questId: 'a' }, options)[1];
    expect(open).toContain('Enter take it to work');
    expect(renderCompact([], { mode: 'list', index: 0 }, options)[1]).toContain('No open quests');
  });

  it('speaks Russian and never exceeds the width', () => {
    const lines = renderCompact([quest('a')], { mode: 'list', index: 0 }, { ...options, lang: 'ru', width: 70 });
    expect(lines[0]).toContain('открыто 1');
    const narrow = renderCompact([quest('a')], { mode: 'list', index: 0 }, { ...options, lang: 'ru', width: 40 });
    for (const line of narrow) expect([...line].length).toBeLessThanOrEqual(40);
  });
});
