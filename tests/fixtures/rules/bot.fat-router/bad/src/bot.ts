import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN ?? '');
bot.command('cmd1', (ctx) => ctx.reply('1'));
bot.command('cmd2', (ctx) => ctx.reply('2'));
bot.command('cmd3', (ctx) => ctx.reply('3'));
bot.command('cmd4', (ctx) => ctx.reply('4'));
bot.command('cmd5', (ctx) => ctx.reply('5'));
bot.command('cmd6', (ctx) => ctx.reply('6'));
bot.command('cmd7', (ctx) => ctx.reply('7'));
bot.command('cmd8', (ctx) => ctx.reply('8'));
bot.command('cmd9', (ctx) => ctx.reply('9'));
bot.command('cmd10', (ctx) => ctx.reply('10'));
bot.command('cmd11', (ctx) => ctx.reply('11'));
bot.launch();
