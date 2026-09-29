import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN ?? '');
bot.command('rate', async (ctx) => {
  const response = await fetch('https://example.com/rate');
  return ctx.reply(await response.text());
});
bot.launch();
