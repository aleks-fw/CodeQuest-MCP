import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN ?? '');
bot.command('rate', async (ctx) => {
  const response = await fetch('https://example.com/rate', { signal: AbortSignal.timeout(5000) });
  return ctx.reply(await response.text());
});
bot.launch();
