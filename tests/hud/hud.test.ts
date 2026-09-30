import { describe, expect, it } from 'vitest';
import { formatHud, formatMinimal, progressBar } from '../../src/hud/hud.js';
import { MAX_NOTIFICATION_LINES, notificationLine, notificationLines } from '../../src/hud/notifications.js';
import { describeCriterion, formatBoard, formatQuestCard, rewardOf, shortId } from '../../src/hud/quests.js';
import { formatReport, formatStats, type ReportItem } from '../../src/hud/report.js';
import type { Criterion, Finding, GameEvent, Quest, Stats } from '../../src/types.js';

const STATS: Stats = {
  architecture: 61,
  testing: 83,
  security: 91,
  performance: 78,
  cleanCode: 69,
  reliability: 100,
  maintainability: 100,
  bugs: 3,
  techDebt: 0,
};

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'a1b2c3d4e5f6',
    template: 't',
    pack: 'shop',
    title: 'Protect Cart',
    description: 'Add tests for the cart logic in lib/cart.ts.',
    category: 'testing',
    difficulty: 'medium',
    findings: ['f'],
    criteria: [
      { type: 'tests_cover', params: { module: 'lib/cart.ts' } },
      { type: 'target_exists', params: { files: ['lib/cart.ts'] } },
      { type: 'command_passes', params: { command: 'test' } },
      { type: 'no_regressions', params: {} },
    ],
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

const event = (type: GameEvent['type'], data: GameEvent['data'], seq = 1): GameEvent => ({ seq, at: '', type, data });

describe('HUD', () => {
  it('draws the four lines of spec §9.6 with a 14-character bar', () => {
    // 3,240 XP: level 7, 240 of 500 into it (48%).
    expect(formatHud(3240, STATS)).toBe(
      ['⚔️ LVL 7 · ANALYST', '███████░░░░░░░ 48% (240/500)', '🧠 61 🧪 83 🛡️ 91', '⚡ 78 🧹 69 🐛 3'].join('\n'),
    );
    expect(progressBar(0)).toHaveLength(14);
    expect(progressBar(100)).toBe('█'.repeat(14));
  });

  it('Minimal is one line with grouped XP', () => {
    expect(formatMinimal(3240)).toBe('⚔️ LVL 7 · ANALYST · 3,240 XP');
    expect(formatMinimal(0)).toBe('⚔️ LVL 1 · NEWCOMER · 0 XP');
  });

  it('level 50 shows MAX and a full bar', () => {
    const hud = formatHud(30000, STATS);
    expect(hud).toContain('LEGEND');
    expect(hud).toContain('MAX (30,000 XP)');
  });
});

describe('board and card', () => {
  const epic = quest({
    id: 'eeeee1111111',
    title: 'Checkout Master',
    difficulty: 'epic',
    criteria: [],
    subtasks: [
      quest({ id: 's1', title: 'Protect Cart', status: 'completed' }),
      quest({ id: 's2', title: 'Payment Guardian' }),
    ],
  });
  const easy = quest({ id: 'bbbbb2222222', title: 'Clean Up TODOs', difficulty: 'easy', category: 'cleanup' });

  it('lists open quests with reward, number and the epic tree', () => {
    const text = formatBoard('shop', 1, [easy, epic, quest({ status: 'completed' })]);
    expect(text.split('\n')[0]).toBe('QUEST BOARD · shop · LVL 1 NEWCOMER');
    expect(text).toContain('🟢 Clean Up TODOs');
    expect(text).toContain('+100 XP · bbbbb');
    expect(text).toContain('🔴 Checkout Master');
    expect(text).toContain('2 tasks');
    expect(text).toContain('+1200 XP');
    expect(text).toContain('├─ Protect Cart ✓');
    expect(text).toContain('└─ Payment Guardian');
    expect(text).not.toContain('Protect Cart · a1b2c');
  });

  it('says so when the board is empty', () => {
    expect(formatBoard('x', 1, [])).toContain('No open quests');
  });

  it('rewards fall with the level (spec §6 table)', () => {
    expect(rewardOf({ difficulty: 'medium' }, 1)).toBe(300);
    expect(rewardOf({ difficulty: 'medium' }, 10)).toBe(189);
  });

  it('the card shows conditions as boxes, then as ✓/✗ with the reason after a check', () => {
    const card = formatQuestCard(quest(), 1);
    expect(card.split('\n')[0]).toBe('QUEST Protect Cart · a1b2c · Medium · Testing · +300 XP');
    expect(card).toContain('□ Tests import lib/cart.ts and have at least 3 test cases and 3 assertions');
    expect(card).toContain('□ lib/cart.ts is still in place and used');
    expect(card).toContain('□ Test command passes');
    expect(card).toContain('□ No regressions');
    const checked = formatQuestCard(quest(), 1, [
      { type: 'tests_cover', ok: false, detail: '1 test cases' },
      { type: 'target_exists', ok: true, detail: '' },
      { type: 'command_passes', ok: true, detail: '' },
      { type: 'no_regressions', ok: true, detail: '' },
    ]);
    expect(checked).toContain('✗ Tests import lib/cart.ts');
    expect(checked).toContain('— 1 test cases');
    expect(checked).toContain('✓ lib/cart.ts is still in place and used');
  });

  it('describes every kind of condition', () => {
    const kinds: Criterion[] = [
      { type: 'finding_resolved', params: {} },
      { type: 'finding_resolved', params: { minCases: 3 } },
      { type: 'target_exists', params: { minBotHandlers: 4 } },
      { type: 'target_exists', params: { files: ['big.ts'], movedLinesShare: 0.5 } },
      { type: 'target_exists', params: { files: ['bot.ts'], commands: ['ban'] } },
      { type: 'pattern_present', params: { files: ['w.ts'], pattern: 'x' } },
      { type: 'pattern_absent', params: { secretKeys: ['k'] } },
      { type: 'pattern_absent', params: { files: ['old.ts'] } },
    ];
    for (const kind of kinds) expect(describeCriterion(kind).length).toBeGreaterThan(10);
    expect(shortId({ id: 'abcdef123456' })).toBe('abcde');
  });
});

describe('notifications', () => {
  it('formats the events of spec §9.6', () => {
    expect(
      notificationLine(
        event('quest_completed', { title: 'Protect Cart', xp: 300, stat: { name: 'testing', from: 42, to: 51 } }),
      ),
    ).toBe('✓ Protect Cart complete · +300 XP · Testing 42 → 51');
    expect(notificationLine(event('level_up', { from: 2, to: 3 }))).toBe('⚔️ LEVEL UP 2 → 3 · CODER');
    expect(
      notificationLine(event('epic_progress', { title: 'Checkout Master', subtask: 'Protect Cart', left: 2 })),
    ).toBe('◐ Checkout Master: Protect Cart done · 2 left');
    expect(notificationLine(event('finding_returned', { rule: 'js/eval', file: 'a.ts' }))).toContain('js/eval in a.ts');
  });

  it('shows stat changes from an analysis, and stays silent about quiet events', () => {
    expect(notificationLine(event('analysis', { stats: { security: [73, 80], testing: [10, 20] } }))).toBe(
      '📈 Security 73 → 80, Testing 10 → 20',
    );
    expect(notificationLine(event('analysis', { stats: {} }))).toBeNull();
    for (const type of ['quest_opened', 'xp', 'quest_obsolete', 'verification_failed', 'settings_changed'] as const) {
      expect(notificationLine(event(type, {}))).toBeNull();
    }
  });

  it('keeps five lines at most and counts the rest', () => {
    const many = Array.from({ length: 8 }, (_, index) => event('level_up', { from: index, to: index + 1 }, index + 1));
    const lines = notificationLines(many);
    expect(lines).toHaveLength(MAX_NOTIFICATION_LINES);
    expect(lines.at(-1)).toBe('+4 more');
    expect(notificationLines(many.slice(0, 5))).toHaveLength(5);
  });
});

describe('reports', () => {
  const item = (overrides: Partial<ReportItem> = {}): ReportItem => ({
    quest: quest(),
    verdict: {
      outcome: 'open',
      scriptChanged: false,
      results: [
        { type: 'tests_cover', ok: false, detail: '0 test cases' },
        { type: 'target_exists', ok: true, detail: '' },
        { type: 'command_passes', ok: false, detail: 'test has not been run for the current files' },
        { type: 'no_regressions', ok: true, detail: '' },
      ],
    },
    xp: 0,
    levelBefore: 1,
    levelAfter: 1,
    ...overrides,
  });

  it('marks each condition and says the quest is not done yet', () => {
    const text = formatReport([item()]);
    expect(text).toContain('CHECK Protect Cart · a1b2c');
    expect(text).toContain('✗ Tests import lib/cart.ts and have at least 3 test cases and 3 assertions — 0 test cases');
    expect(text).toContain('✓ lib/cart.ts is still in place and used');
    expect(text).toContain('Result: NOT DONE YET');
  });

  it('a completed quest shows XP, the stat and the level up; a changed script is called out', () => {
    const text = formatReport([
      item({
        verdict: { outcome: 'completed', scriptChanged: true, results: [] },
        xp: 240,
        levelBefore: 2,
        levelAfter: 3,
        stat: { name: 'testing', from: 42, to: 51 },
      }),
    ]);
    expect(text).toContain('Result: COMPLETE · +240 XP · Testing 42 → 51');
    expect(text).toContain('x0.8');
    expect(text).toContain('⚔️ LEVEL UP 2 → 3 · CODER');
  });

  it('an obsolete quest gives no XP; an empty check says there is nothing to check', () => {
    expect(formatReport([item({ verdict: { outcome: 'obsolete', scriptChanged: false, results: [] } })])).toContain(
      'OBSOLETE',
    );
    expect(formatReport([])).toBe('No open quests to check.');
  });

  it('an epic report lists its subtasks', () => {
    const epic = quest({
      title: 'Checkout Master',
      difficulty: 'epic',
      criteria: [],
      subtasks: [quest({ id: 's1', title: 'Protect Cart' }), quest({ id: 's2', title: 'Payment Guardian' })],
    });
    const text = formatReport([
      item({
        quest: epic,
        verdict: {
          outcome: 'open',
          scriptChanged: false,
          results: [],
          subtasks: [
            { questId: 's1', outcome: 'completed', results: [] },
            { questId: 's2', outcome: 'open', results: [{ type: 'tests_cover', ok: false, detail: 'no tests' }] },
          ],
        },
      }),
    ]);
    expect(text).toContain('✓ Protect Cart');
    expect(text).toContain('✗ Payment Guardian');
    expect(text).toContain('— no tests');
  });

  it('stats list every stat and the worst findings first', () => {
    const findings: Finding[] = [
      {
        id: '1',
        rule: 'generic/todo',
        category: 'clean-code',
        severity: 'low',
        message: '',
        key: '',
        file: 'a.ts',
        line: 3,
      },
      { id: '2', rule: 'js/eval', category: 'security', severity: 'high', message: '', key: '', file: 'b.ts' },
    ];
    const text = formatStats(STATS, findings);
    expect(text).toContain('Security: 91');
    expect(text).toContain('Tech Debt: 0');
    expect(text.indexOf('js/eval')).toBeLessThan(text.indexOf('generic/todo'));
    expect(text).toContain('[low] Clean Code · generic/todo a.ts:3');
  });
});

describe('HUD in Russian', () => {
  it('draws the frame with Russian words and title, the numbers unchanged', () => {
    expect(formatHud(3240, STATS, 'ru')).toBe(
      ['⚔️ УР. 7 · АНАЛИТИК', '███████░░░░░░░ 48% (240/500)', '🧠 61 🧪 83 🛡️ 91', '⚡ 78 🧹 69 🐛 3'].join('\n'),
    );
    expect(formatMinimal(3240, 'ru')).toBe('⚔️ УР. 7 · АНАЛИТИК · 3,240 XP');
    expect(formatHud(3240, STATS)).toBe(formatHud(3240, STATS, 'en'));
  });

  it('says МАКС at level 50', () => {
    expect(formatHud(30000, STATS, 'ru')).toContain('МАКС');
    expect(formatHud(30000, STATS)).toContain('MAX');
  });

  it('notifications follow the language', () => {
    expect(notificationLine(event('level_up', { from: 17, to: 18 }), 'ru')).toBe(
      '⚔️ НОВЫЙ УРОВЕНЬ 17 → 18 · УБИЙЦА БОССОВ',
    );
    expect(
      notificationLine(
        event('quest_completed', { title: 'T', xp: 150, stat: { name: 'testing', from: 40, to: 42 } }),
        'ru',
      ),
    ).toBe('✓ T: выполнено · +150 XP · Тестирование 40 → 42');
    expect(notificationLine(event('quest_completed', { title: 'T', xp: 150 }))).toBe('✓ T complete · +150 XP');
    expect(notificationLine(event('epic_progress', { title: 'E', subtask: 'S', left: 2 }), 'ru')).toBe(
      '◐ E: S готово · осталось 2',
    );
    const many = Array.from({ length: 8 }, () => event('level_up', { from: 1, to: 2 }));
    expect(notificationLines(many, 'ru').at(-1)).toBe('ещё 4');
    expect(notificationLines(many).at(-1)).toBe('+4 more');
  });
});
