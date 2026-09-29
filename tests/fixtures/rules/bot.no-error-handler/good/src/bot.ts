import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN ?? '');
bot.catch((error) => console.error(error));
bot.start((ctx) => ctx.reply('Welcome'));
bot.launch();
