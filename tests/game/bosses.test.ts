import { describe, expect, it } from 'vitest';
import { BOSSES, type BossEventLike, bossEvents, evaluateBosses } from '../../src/game/bosses.js';
import type { Finding, Quest } from '../../src/types.js';

const at = '2026-10-02T10:00:00.000Z';
let n = 0;
const finding = (rule: string): Finding => ({
  id: `f${++n}`,
  rule,
  category: 'cleanup',
  severity: 'low',
  message: 'm',
  key: `k${n}`,
});
const many = (rule: string, count: number): Finding[] => Array.from({ length: count }, () => finding(rule));
const ev = (type: string, data: Record<string, unknown> = {}, when = at): BossEventLike => ({ type, at: when, data });
const quest = (findings: string[], extra: Partial<Quest> = {}): Quest =>
  ({ id: `q${++n}`, status: 'open', findings, ...extra }) as unknown as Quest;
const kinds = (events: ReturnType<typeof bossEvents>): string[] =>
  events.map((event) => `${event.type}:${String(event.data?.id)}`);

describe('the catalog', () => {
  it('has the 7 bosses, positive thresholds and no rule in two bosses', () => {
    expect(BOSSES.map((boss) => boss.id)).toEqual([
      'dark-forest',
      'graveyard',
      'clone-army',
      'secret-leak',
      'blind-spots',
      'breach',
      'todo-swamp',
    ]);
    expect(BOSSES.every((boss) => boss.threshold > 0 && boss.rules.length > 0)).toBe(true);
    const rules = BOSSES.flatMap((boss) => boss.rules);
    expect(new Set(rules).size).toBe(rules.length);
  });
});

describe('bossEvents', () => {
  it('starts a fight exactly at the threshold, not below', () => {
    expect(bossEvents(many('generic/unused-file', 5), [], at)).toEqual([]);
    expect(bossEvents(many('generic/unused-file', 6), [], at)).toEqual([
      { at, type: 'boss_spawned', data: { id: 'graveyard', hp: 6 } },
    ]);
    expect(bossEvents(many('generic/unused-file', 7), [], at)[0]?.data).toEqual({ id: 'graveyard', hp: 7 });
  });

  it('counts the findings of all the rules of a theme together', () => {
    const secrets = [...many('generic/hardcoded-secret', 2), ...many('generic/env-tracked', 1)];
    expect(kinds(bossEvents(secrets, [], at))).toEqual(['boss_spawned:secret-leak']);
    expect(bossEvents(many('generic/hardcoded-secret', 2), [], at)).toEqual([]);
  });

  it('starts several fights in the order of the catalog', () => {
    const findings = [...many('generic/unused-file', 6), ...many('generic/untested-module', 8)];
    expect(kinds(bossEvents(findings, [], at))).toEqual(['boss_spawned:dark-forest', 'boss_spawned:graveyard']);
  });

  it('does nothing while a fight is on and the findings are still there', () => {
    const journal = [ev('boss_spawned', { id: 'graveyard', hp: 7 })];
    expect(bossEvents(many('generic/unused-file', 7), journal, at)).toEqual([]);
    // Few findings left: the boss is alive until the last one is gone.
    expect(bossEvents(many('generic/unused-file', 1), journal, at)).toEqual([]);
  });

  it('ends the fight when no finding of the theme is left, once', () => {
    const journal = [ev('boss_spawned', { id: 'graveyard', hp: 7 })];
    expect(bossEvents([], journal, at)).toEqual([{ at, type: 'boss_defeated', data: { id: 'graveyard' } }]);
    const after = [...journal, ev('boss_defeated', { id: 'graveyard' })];
    expect(bossEvents([], after, at)).toEqual([]);
  });

  it('starts a new fight when the problems come back after a victory', () => {
    const after = [ev('boss_spawned', { id: 'graveyard', hp: 7 }), ev('boss_defeated', { id: 'graveyard' })];
    expect(bossEvents(many('generic/unused-file', 5), after, at)).toEqual([]);
    expect(kinds(bossEvents(many('generic/unused-file', 6), after, at))).toEqual(['boss_spawned:graveyard']);
  });

  it('is idempotent: after its events are in the journal a second call gives nothing', () => {
    const findings = many('generic/unused-file', 6);
    const first = bossEvents(findings, [], at);
    expect(bossEvents(findings, first, at)).toEqual([]);
    const done = bossEvents([], first, at);
    expect(kinds(done)).toEqual(['boss_defeated:graveyard']);
    expect(bossEvents([], [...first, ...done], at)).toEqual([]);
  });

  it('ignores events without an id and a finding of no theme', () => {
    const odd = [ev('boss_spawned', {}), ev('boss_spawned', { id: 5 }), ev('boss_defeated', { id: 'zzz' })];
    expect(kinds(bossEvents(many('generic/unused-file', 6), odd, at))).toEqual(['boss_spawned:graveyard']);
    expect(bossEvents(many('generic/failing-tests', 50), [], at)).toEqual([]);
  });
});

describe('evaluateBosses', () => {
  const spawned = (id: string, hp: number, when = at) => ev('boss_spawned', { id, hp }, when);

  it('shows the HP left and the biggest HP of the fight', () => {
    const board = evaluateBosses(many('generic/unused-file', 5), [spawned('graveyard', 12)], []);
    expect(board.active).toEqual([{ id: 'graveyard', hp: 5, max: 12, spawnedAt: at, quests: 0 }]);
    const grown = evaluateBosses(many('generic/unused-file', 9), [spawned('graveyard', 6)], []);
    expect(grown.active[0]).toMatchObject({ hp: 9, max: 9 });
  });

  it('lists only the fights that are on, and not one whose last finding is gone but not yet recorded', () => {
    expect(evaluateBosses([], [spawned('graveyard', 6)], [])).toEqual({ active: [], defeated: [] });
    expect(evaluateBosses(many('generic/unused-file', 6), [], [])).toEqual({ active: [], defeated: [] });
  });

  it('counts the open quests that have a finding of the boss, in the quest or in its subtasks', () => {
    const findings = many('generic/unused-file', 6);
    const [a, b, c] = findings;
    const other = finding('generic/todo');
    const quests = [
      quest([String(a?.id)]),
      quest([], { subtasks: [quest([String(b?.id)]), quest([other.id])] }),
      quest([String(c?.id)], { status: 'completed' }),
      quest([String(c?.id)], { status: 'obsolete' }),
      quest([other.id]),
    ];
    const board = evaluateBosses(findings, [spawned('graveyard', 6)], quests);
    expect(board.active[0]?.quests).toBe(2);
  });

  it('lists the victories newest first, at most 10, and skips ids it does not know', () => {
    const journal = [
      spawned('graveyard', 6),
      ev('boss_defeated', { id: 'graveyard' }, '2026-10-01T10:00:00.000Z'),
      spawned('dark-forest', 8),
      ev('boss_defeated', { id: 'dark-forest' }, '2026-10-02T10:00:00.000Z'),
      ev('boss_defeated', { id: 'from-the-future' }, '2026-10-03T10:00:00.000Z'),
      spawned('mystery', 5),
    ];
    expect(evaluateBosses([], journal, []).defeated).toEqual([
      { id: 'dark-forest', defeatedAt: '2026-10-02T10:00:00.000Z' },
      { id: 'graveyard', defeatedAt: '2026-10-01T10:00:00.000Z' },
    ]);
    const lots = Array.from({ length: 12 }, (_, i) =>
      ev('boss_defeated', { id: 'graveyard' }, `2026-09-${String(i + 10).padStart(2, '0')}T10:00:00.000Z`),
    );
    expect(evaluateBosses([], lots, []).defeated).toHaveLength(10);
  });

  it('does not fail on wrong-typed data', () => {
    const board = evaluateBosses(
      many('generic/unused-file', 6),
      [ev('boss_spawned', { id: 'graveyard', hp: 'x' })],
      [],
    );
    expect(board.active[0]).toMatchObject({ id: 'graveyard', hp: 6, max: 6 });
  });
});
