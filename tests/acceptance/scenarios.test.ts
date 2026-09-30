import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Engine, type ProjectView } from '../../src/engine/index.js';
import type { CommandRun } from '../../src/types.js';
import type { RunOptions, RunOutcome } from '../../src/verification/commands.js';
import { copyFixture } from '../helpers/fixtures.js';
import { cleanupTempDirs, makeTempDir } from '../helpers/temp-project.js';

// The scenarios of spec §10, run through the engine on a copy of the shop fixture.

afterAll(cleanupTempDirs);

let clock = Date.parse('2026-09-30T12:00:00.000Z');
const now = (): Date => {
  clock += 1000;
  return new Date(clock);
};

function green(options: RunOptions): RunOutcome {
  const run: CommandRun = {
    ok: true,
    exitCode: 0,
    durationMs: 1000,
    changeKey: options.changeKey,
    at: options.now().toISOString(),
    tail: 'ok',
  };
  return { run };
}

async function shop() {
  const root = await copyFixture('projects/nextjs-shop');
  const calls: string[] = [];
  const engine = new Engine({
    home: await makeTempDir(),
    cwd: root,
    now,
    runCommand: async (options) => {
      calls.push(options.command);
      return green(options);
    },
  });
  return { root, engine, calls };
}

const open = (view: { state: ProjectView['state'] }) => view.state.quests.filter((quest) => quest.status === 'open');
const titles = (view: { state: ProjectView['state'] }) => open(view).map((quest) => quest.title);

const CART_TEST = `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addItem, cartTotal, removeItem } from './cart.ts';

const apple = { id: 'a', name: 'Apple', priceCents: 100 };

test('adds an item', () => {
  const cart = addItem([], apple, 2);
  assert.equal(cart.length, 1);
  assert.equal(cart[0]?.quantity, 2);
});

test('removes an item', () => {
  assert.deepEqual(removeItem(addItem([], apple, 1), 'a'), []);
});

test('sums the cart', () => {
  assert.equal(cartTotal(addItem([], apple, 3)), 300);
});
`;

const PAYMENT_TEST = `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isOrderPaid, markOrderPaid } from './payment.ts';

test('a new order is not paid', () => {
  assert.equal(isOrderPaid('o1'), false);
});

test('marking an order paid', () => {
  markOrderPaid('o2');
  assert.equal(isOrderPaid('o2'), true);
});

test('other orders stay unpaid', () => {
  markOrderPaid('o3');
  assert.equal(isOrderPaid('o4'), false);
});
`;

const WEBHOOK = `import Stripe from 'stripe';
import { markOrderPaid } from '@/lib/payment';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

export async function POST(request: Request): Promise<Response> {
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';
  const event = stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET ?? '');
  if (event.type === 'payment_intent.succeeded') {
    const orderId = (event.data.object as { metadata: { orderId?: string } }).metadata.orderId;
    if (orderId) {
      markOrderPaid(orderId);
    }
  }
  return new Response(null, { status: 200 });
}
`;

describe('full cycle: quest → fix → auto check → XP → level', () => {
  it('Clean Inventory (+100 XP) and the three Checkout Master tasks (+1200 XP) take the shop from level 1 to 3', async () => {
    const { root, engine, calls } = await shop();
    // Commands are allowed before the first look, so the quests carry the starred conditions (spec §7.1).
    const first = await engine.setSettings({}, { allowCommands: true });
    expect(titles(first).sort()).toEqual(
      ['Checkout Master', 'Clean Inventory', 'Clean Up TODOs', 'Optimize Images'].sort(),
    );
    expect(first.state).toMatchObject({ xp: 0, level: 1 });

    await rm(path.join(root, 'components', 'ProductBadge.tsx'));
    // The automatic check never runs commands, so the checks that need them are asked for with the check button.
    const inventory = await engine.verify({});
    expect(inventory?.state).toMatchObject({ xp: 100, level: 1 });
    expect(inventory?.state.quests.find((quest) => quest.title === 'Clean Inventory')?.xpAwarded).toBe(100);

    await writeFile(path.join(root, 'lib', 'cart.test.ts'), CART_TEST);
    await writeFile(path.join(root, 'lib', 'payment.test.ts'), PAYMENT_TEST);
    await writeFile(path.join(root, 'app', 'api', 'webhooks', 'stripe', 'route.ts'), WEBHOOK);
    const epic = await engine.verify({});
    const master = epic?.state.quests.find((quest) => quest.title === 'Checkout Master');
    expect(master).toMatchObject({ status: 'completed', xpAwarded: 1200 });
    expect(master?.subtasks?.map((task) => task.status)).toEqual(['completed', 'completed', 'completed']);
    expect(epic?.state).toMatchObject({ xp: 1300, level: 3 });
    expect(epic?.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['quest_completed', 'xp', 'level_up']),
    );
    // The project's own commands ran once per change key, never per quest.
    expect(calls.filter((call) => call === 'npm test').length).toBeLessThanOrEqual(2);
  });
});

describe('adaptation: a well-tested project stops getting Easy and Medium testing quests', () => {
  it('after tests are added, Testing reaches 80 and the testing quests are gone; other quests remain', async () => {
    const { root, engine } = await shop();
    const before = await engine.view({});
    expect(before.state.stats.testing).toBeLessThan(80);

    // A coverage report says 90% of the lines are tested; the Testing stat then takes it instead of the module share.
    await mkdir(path.join(root, 'coverage'));
    await writeFile(
      path.join(root, 'coverage', 'coverage-summary.json'),
      JSON.stringify({ total: { lines: { pct: 90 } } }),
    );
    await writeFile(path.join(root, 'lib', 'cart.test.ts'), CART_TEST);
    await writeFile(path.join(root, 'lib', 'payment.test.ts'), PAYMENT_TEST);
    const after = await engine.refresh({}, true);
    expect(after.state.stats.testing).toBeGreaterThanOrEqual(80);
    const testing = open(after).filter((quest) => quest.category === 'testing' && quest.difficulty !== 'hard');
    expect(testing).toEqual([]);
    expect(titles(after)).toContain('Clean Up TODOs');
  });
});

describe('protection against inflating', () => {
  it('"done" with nothing changed pays 0 XP and the quest stays', async () => {
    const { engine } = await shop();
    await engine.view({});
    const view = await engine.verify({});
    expect(view.state.xp).toBe(0);
    expect(view.reports.every((report) => report.verdict.outcome === 'open' && report.xp === 0)).toBe(true);
  });

  it('a deleted module makes its quest obsolete, not paid', async () => {
    const { root, engine } = await shop();
    await engine.view({});
    await rm(path.join(root, 'lib', 'payment.ts'));
    const view = await engine.poll();
    const master = view?.state.quests.find((quest) => quest.title === 'Checkout Master');
    expect(master?.subtasks?.find((task) => task.title === 'Payment Guardian')?.status).toBe('obsolete');
    expect(view?.state.xp).toBe(0);
  });

  it('a suppression comment is a new finding, not a way to hide a problem', async () => {
    const { root, engine } = await shop();
    const before = await engine.view({});
    const cart = path.join(root, 'lib', 'cart.ts');
    await writeFile(cart, `// @ts-ignore\n${await readFile(cart, 'utf8')}`);
    const after = await engine.refresh({}, true);
    const count = (view: ProjectView) =>
      view.snapshot?.findings.filter((f) => f.rule === 'generic/suppression').length ?? 0;
    expect(count(after)).toBe(count(before) + 1);
  });

  it('a changed test script lowers the reward to 80%', async () => {
    const { root, engine } = await shop();
    await engine.setSettings({}, { allowCommands: true });
    const manifest = path.join(root, 'package.json');
    const pkg = JSON.parse(await readFile(manifest, 'utf8')) as { scripts: Record<string, string> };
    pkg.scripts.test = 'node --test --test-reporter=dot';
    await writeFile(manifest, JSON.stringify(pkg, null, 2));
    await rm(path.join(root, 'components', 'ProductBadge.tsx'));
    const view = await engine.verify({});
    const done = view?.state.quests.find((quest) => quest.title === 'Clean Inventory');
    expect(done).toMatchObject({ status: 'completed', xpAwarded: 80 });
    expect(view?.events.find((event) => event.type === 'quest_completed')?.data.scriptChanged).toBe(true);
  });

  it('a paid finding is paid once: the same problem coming back and being fixed again gives 0 XP', async () => {
    const { root, engine } = await shop();
    await engine.view({});
    const badge = path.join(root, 'components', 'ProductBadge.tsx');
    const text = await readFile(badge, 'utf8');
    await rm(badge);
    const paid = await engine.poll();
    expect(paid?.state.xp).toBe(80);
    await writeFile(badge, text);
    const returned = await engine.poll();
    expect(returned?.events.map((event) => event.type)).toContain('finding_returned');
    await rm(badge);
    const again = await engine.poll();
    expect(again?.state.xp).toBe(80);
  });
});
