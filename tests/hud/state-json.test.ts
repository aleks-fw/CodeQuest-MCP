import { describe, expect, it } from 'vitest';
import type { ProjectView } from '../../src/engine/index.js';
import type { BossesView } from '../../src/game/bosses.js';
import { buildStateDocument } from '../../src/hud/state-json.js';
import type { Quest } from '../../src/types.js';

const quest = (over: Partial<Quest>): Quest =>
  ({
    id: 'q1',
    template: 'x',
    pack: 'generic',
    title: 'Fix the thing',
    description: '',
    category: 'testing',
    difficulty: 'medium',
    findings: [],
    criteria: [],
    status: 'open',
    createdAt: '2026-10-01T00:00:00.000Z',
    ...over,
  }) as Quest;

const view = (over: Record<string, unknown> = {}, quests: Quest[] = []): ProjectView =>
  ({
    project: { id: 'p', name: 'shop', root: 'D:/проект 1/shop' },
    record: {},
    state: {
      xp: 975,
      level: 2,
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
      quests,
    },
    snapshot: null,
    busy: false,
    events: [],
    reports: [],
    unavailable: [],
    lang: 'en',
    owed: { count: 0, xp: 0 },
    playerClass: null,
    ...over,
  }) as unknown as ProjectView;

const bosses = (over: Partial<BossesView> = {}): BossesView =>
  ({ project: { id: 'p', name: 'shop', root: 'x' }, lang: 'en', active: [], defeated: [], ...over }) as BossesView;

describe('buildStateDocument', () => {
  it('describes level, xp inside the level, title and project', () => {
    const doc = buildStateDocument(view(), bosses());
    expect(doc.version).toBe(1);
    expect(doc.project).toEqual({ name: 'shop', path: 'D:/проект 1/shop' });
    expect(doc.level).toBe(2);
    expect(doc.xp).toEqual({ current: 475, forLevel: 500, max: false });
    expect(doc.title).not.toBe('');
    expect(doc.title).toBe(doc.title.toUpperCase());
    expect(doc.stats.security).toBe(90);
  });

  it('has class null and boss null when there are none, and passes busy and owed through', () => {
    const doc = buildStateDocument(view({ busy: true, owed: { count: 2, xp: 120 } }), bosses());
    expect(doc.class).toBeNull();
    expect(doc.boss).toBeNull();
    expect(doc.bossesActive).toBe(0);
    expect(doc.busy).toBe(true);
    expect(doc.owed).toEqual({ count: 2, xp: 120 });
  });

  it('names the class and its hybrid partner', () => {
    const player = { primary: 'tester', secondary: 'architect', shares: [], stats: [] };
    const doc = buildStateDocument(view({ playerClass: player }), bosses());
    expect(doc.class).toEqual({ id: 'tester', secondary: 'architect', name: 'Test Architect' });
    const solo = buildStateDocument(view({ playerClass: { ...player, secondary: undefined } }), bosses());
    expect(solo.class).toEqual({ id: 'tester', name: 'Tester' });
  });

  it('counts open, done and in-progress quests (at most five, accepted ones only)', () => {
    const quests = [
      ...Array.from({ length: 7 }, (_, i) =>
        quest({ id: `a${i}`, title: `Accepted ${i}`, acceptedAt: '2026-10-02T00:00:00.000Z' }),
      ),
      quest({ id: 'o', title: 'Open' }),
      quest({ id: 'c', status: 'completed' }),
      quest({ id: 'x', status: 'obsolete' }),
    ];
    const doc = buildStateDocument(view({}, quests), bosses());
    expect(doc.quests.open).toBe(8);
    expect(doc.quests.done).toBe(1);
    expect(doc.quests.inProgress).toHaveLength(5);
    expect(doc.quests.inProgress[0]).toEqual({ id: 'a0', title: 'Accepted 0', difficulty: 'medium' });
  });

  it('shows the first active boss by name and counts all of them; an unknown id is shown by id', () => {
    const active = [
      { id: 'graveyard', hp: 10, max: 12, spawnedAt: 't', quests: 1 },
      { id: 'from-the-future', hp: 3, max: 3, spawnedAt: 't', quests: 0 },
    ];
    const doc = buildStateDocument(view(), bosses({ active }));
    expect(doc.boss).toEqual({ id: 'graveyard', name: expect.any(String), hp: 10, max: 12 });
    expect(doc.boss?.name).not.toBe('graveyard');
    expect(doc.bossesActive).toBe(2);
    const odd = buildStateDocument(view(), bosses({ active: [active[1] as (typeof active)[number]] }));
    expect(odd.boss?.name).toBe('from-the-future');
  });

  it('speaks Russian when the view does and marks level 50 as max', () => {
    const ru = buildStateDocument(view({ lang: 'ru' }), bosses({ lang: 'ru' }));
    expect(ru.lang).toBe('ru');
    const top = view({ lang: 'en' });
    top.state.xp = 49 * 500 + 120;
    top.state.level = 50;
    expect(buildStateDocument(top, bosses()).xp.max).toBe(true);
  });
});
