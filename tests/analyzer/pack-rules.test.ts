import { describe, expect, it } from 'vitest';
import { detectDomains } from '../../src/analyzer/domains.js';
import { botAdminNoCheckRule } from '../../src/analyzer/rules/bot-admin-no-check.js';
import { botFatRouterRule } from '../../src/analyzer/rules/bot-fat-router.js';
import { botNoErrorHandlerRule } from '../../src/analyzer/rules/bot-no-error-handler.js';
import { botNoTimeoutRule } from '../../src/analyzer/rules/bot-no-timeout.js';
import { shopWebhookNoSignatureRule } from '../../src/analyzer/rules/shop-webhook-no-signature.js';
import { runRule } from '../helpers/rule-context.js';
import { sourceFiles } from '../helpers/source-files.js';

const domain = (dependencies: string[], paths: string[] = [], botHandlers = 0) =>
  detectDomains({
    files: sourceFiles(Object.fromEntries(paths.map((path) => [path, 'x\n']))),
    dependencies,
    botHandlers,
  }).map((item) => [item.pack, item.confidence]);

describe('detectDomains', () => {
  it('always has the generic pack', () => {
    expect(domain([])).toEqual([['generic', 1]]);
  });

  it('shop: payment dependency 0.5 plus 0.15 per path group, at most 1', () => {
    expect(domain(['stripe'])).toEqual([
      ['generic', 1],
      ['shop', 0.5],
    ]);
    expect(domain(['@stripe/stripe-js'], ['lib/cart.ts', 'lib/order.ts'])).toContainEqual(['shop', 0.8]);
    expect(
      domain(['@shopify/hydrogen'], ['cart/a.ts', 'checkout/a.ts', 'product/a.ts', 'payment/a.ts']),
    ).toContainEqual(['shop', 1]);
  });

  it('shop: paths alone stay below the threshold (0.6 needs a payment dependency)', () => {
    expect(domain([], ['lib/cart.ts', 'lib/checkout.ts', 'lib/product.ts'])).toEqual([['generic', 1]]);
  });

  it('bot: framework 0.8, handlers add 0.2; no framework means off', () => {
    expect(domain(['grammy'])).toContainEqual(['bot', 0.8]);
    expect(domain(['aiogram'], [], 3)).toContainEqual(['bot', 1]);
    expect(domain([], [], 20)).toEqual([['generic', 1]]);
  });
});

describe('shop/webhook-no-signature', () => {
  it('flags a webhook route without a signature check, not one with it or non-webhook files', () => {
    const hits = runRule(shopWebhookNoSignatureRule, {
      'app/api/webhooks/stripe/route.ts':
        'export async function POST(r: Request) { return Response.json(await r.json()); }\n',
      'app/api/webhooks/paypal/route.ts':
        'const e = stripe.webhooks.constructEvent(body, sig, secret);\nexport const POST = () => e;\n',
      'pages/api/payment-webhook.js': "const h = crypto.createHmac('sha256', s); crypto.timingSafeEqual(a, b);\n",
      'lib/payment.ts': 'export const pay = 1;\n',
    });
    expect(hits.map((hit) => hit.file)).toEqual(['app/api/webhooks/stripe/route.ts']);
  });
});

describe('bot/no-error-handler', () => {
  it.each([
    ['bot.catch((e) => log(e));', 'js/telegraf'],
    ["bot.on('polling_error', log);", 'node-telegram-bot-api'],
    ['@dp.errors()\nasync def on_error(e): ...', 'aiogram dp.errors'],
    ['@router.errors()\nasync def on_error(e): ...', 'aiogram router.errors'],
    ['app.add_error_handler(on_error)', 'python-telegram-bot'],
  ])('is silent when the code has a handler: %s (%s)', (code, name) => {
    const file = name.startsWith('js') || name.startsWith('node') ? 'src/bot.ts' : 'bot.py';
    expect(runRule(botNoErrorHandlerRule, { [file]: `${code}\n` })).toEqual([]);
  });

  it('flags a project without one, as a project-level finding, and ignores promise.catch', () => {
    const hits = runRule(botNoErrorHandlerRule, { 'src/bot.ts': 'fetch(url).catch((e) => log(e));\nbot.launch();\n' });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.file).toBeUndefined();
  });
});

describe('bot/admin-no-check', () => {
  it('flags admin-like JS commands without a check and accepts ADMIN ids, from.id and getChatMember', () => {
    const hits = runRule(botAdminNoCheckRule, {
      'src/bot.ts': [
        "bot.command('ban', (ctx) => ctx.banChatMember(1));",
        "bot.command('broadcast', (ctx) => { if (ctx.from.id !== OWNER_ID) return; send(); });",
        "bot.command('kick', async (ctx) => { const m = await ctx.getChatMember(ctx.from.id); });",
        "bot.command('stats', (ctx) => { if (!ADMIN_IDS.includes(1)) return; });",
        "bot.command(['mute', 'help'], (ctx) => ctx.restrictChatMember(1));",
        "bot.command('start', (ctx) => ctx.reply('hi'));",
      ].join('\n'),
    });
    expect(hits.map((hit) => hit.key)).toEqual(['ban', 'mute']);
  });

  it('does not treat the command name itself as a check', () => {
    const hits = runRule(botAdminNoCheckRule, { 'src/bot.ts': "bot.command('admin', (ctx) => ctx.reply('panel'));\n" });
    expect(hits.map((hit) => hit.key)).toEqual(['admin']);
  });

  it('handles aiogram decorators, filters in the decorator and python-telegram-bot handlers', () => {
    const hits = runRule(botAdminNoCheckRule, {
      'bot.py': [
        '@dp.message(Command("ban"))',
        'async def ban(message): await bot.ban_chat_member(1, 2)',
        '',
        '@dp.message(Command("unban"), F.from_user.id.in_(ADMIN_IDS))',
        'async def unban(message): await bot.unban_chat_member(1, 2)',
        '',
        '@dp.message(Command("kick"))',
        'async def kick(message):',
        '    if message.from_user.id not in ADMIN_IDS:',
        '        return',
        '',
        '@dp.message(Command("start"))',
        'async def start(message): ...',
        'app.add_handler(CommandHandler("mute", mute))',
      ].join('\n'),
      'handlers.py':
        'async def mute(update, context):\n    await update.effective_chat.restrict_member(1)\n\ndef other(): ...\n',
    });
    expect(hits.map((hit) => [hit.file, hit.key])).toEqual([['bot.py', 'ban']]);
  });

  it('checks the python-telegram-bot handler function in the same file', () => {
    const hits = runRule(botAdminNoCheckRule, {
      'bot.py': [
        'async def mute(update, context):',
        '    await update.effective_chat.restrict_member(1)',
        '',
        'async def safe(update, context): ...',
        'app.add_handler(CommandHandler("mute", mute))',
      ].join('\n'),
    });
    expect(hits.map((hit) => hit.key)).toEqual(['mute']);
  });
});

describe('bot/fat-router', () => {
  it('flags more than 10 registrations in one file and only that file', () => {
    const many = Array.from({ length: 11 }, (_, index) => `bot.command('c${index}', run);`).join('\n');
    const ten = Array.from({ length: 10 }, (_, index) => `bot.command('c${index}', run);`).join('\n');
    const hits = runRule(botFatRouterRule, { 'src/big.ts': many, 'src/ten.ts': ten });
    expect(hits.map((hit) => hit.file)).toEqual(['src/big.ts']);
  });
});

describe('bot/no-timeout', () => {
  it('flags fetch, axios, requests and aiohttp calls without a timeout', () => {
    const hits = runRule(botNoTimeoutRule, {
      'src/a.ts': [
        "const a = await fetch('https://x.test/a');",
        "const b = await axios.get('https://x.test/b');",
        "const c = await fetch('https://x.test/c', { signal: AbortSignal.timeout(3000) });",
        "const d = await axios.post('https://x.test/d', body, { timeout: 5000 });",
        "// const e = await fetch('https://x.test/e');",
      ].join('\n'),
      'b.py': [
        "r = requests.get('https://x.test/a')",
        "s = requests.post('https://x.test/b', json=data, timeout=5)",
        "async with session.get('https://x.test/c') as resp: ...",
      ].join('\n'),
    });
    expect(hits.map((hit) => [hit.file, hit.line])).toEqual([
      ['b.py', 1],
      ['b.py', 3],
      ['src/a.ts', 1],
      ['src/a.ts', 2],
    ]);
  });

  it('treats a file-wide timeout setting as covering its client', () => {
    const hits = runRule(botNoTimeoutRule, {
      'src/a.ts': "axios.defaults.timeout = 5000;\nconst a = await axios.get('https://x.test/a');\n",
      'b.py': "timeout = aiohttp.ClientTimeout(total=5)\nasync with session.get('https://x.test/a') as resp: ...\n",
    });
    expect(hits).toEqual([]);
  });

  it('finds the timeout inside nested brackets of a multi-line call', () => {
    const hits = runRule(botNoTimeoutRule, {
      'src/a.ts':
        'const a = await fetch(buildUrl(city), {\n  headers: { a: 1 },\n  signal: AbortSignal.timeout(1000),\n});\n',
    });
    expect(hits).toEqual([]);
  });

  it('stays fast on a huge file of unclosed calls', () => {
    const started = performance.now();
    runRule(botNoTimeoutRule, { 'src/a.ts': 'fetch(\n'.repeat(50_000) });
    expect(performance.now() - started, 'no-timeout time').toBeLessThan(3000);
  });
});
