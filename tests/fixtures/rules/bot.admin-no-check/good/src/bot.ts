import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN ?? '');
const ADMIN_IDS = [1];
bot.command('ban', (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return ctx.reply('No access');
  return ctx.banChatMember(Number(ctx.message.text.split(' ')[1]));
});
bot.command('help', (ctx) => ctx.reply('Help'));
bot.launch();
