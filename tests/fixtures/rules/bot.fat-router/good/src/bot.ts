import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN ?? '');
bot.command('cmd1', (ctx) => ctx.reply('1'));
bot.command('cmd2', (ctx) => ctx.reply('2'));
bot.command('cmd3', (ctx) => ctx.reply('3'));
bot.launch();
