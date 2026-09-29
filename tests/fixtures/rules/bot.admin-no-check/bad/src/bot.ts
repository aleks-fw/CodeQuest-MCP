import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN ?? '');
bot.command('ban', (ctx) => ctx.banChatMember(Number(ctx.message.text.split(' ')[1])));
bot.command('help', (ctx) => ctx.reply('Help'));
bot.launch();
