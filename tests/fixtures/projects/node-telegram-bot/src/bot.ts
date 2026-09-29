import { Markup, Telegraf } from 'telegraf';
import { formatPrice } from './format.ts';
import { parseCommand } from './parse.ts';

const bot = new Telegraf(process.env.BOT_TOKEN ?? '');
const reminders = new Map<number, string[]>();

bot.start((ctx) => ctx.reply('Welcome! Send /help to see what I can do.'));

bot.help((ctx) => ctx.reply('Commands: /about, /price, /weather, /remind, /feedback, /ban'));

bot.command('about', (ctx) => ctx.reply('Shop helper bot: prices, weather and reminders.'));

bot.command('price', (ctx) => {
  const { args } = parseCommand(ctx.message.text);
  const cents = Number(args[0] ?? '0');
  return ctx.reply(`Price: ${formatPrice(cents)}`);
});

bot.command('weather', async (ctx) => {
  const { args } = parseCommand(ctx.message.text);
  const city = args.join(' ') || 'London';
  const response = await fetch(`${process.env.WEATHER_API_URL}/current?city=${encodeURIComponent(city)}`);
  const data = (await response.json()) as { temperature: number };
  return ctx.reply(`${city}: ${data.temperature} C`);
});

bot.command('remind', (ctx) => {
  const { args } = parseCommand(ctx.message.text);
  const list = reminders.get(ctx.chat.id) ?? [];
  list.push(args.join(' '));
  reminders.set(ctx.chat.id, list);
  return ctx.reply(`Saved. This chat has ${list.length} reminders.`);
});

bot.command('feedback', (ctx) => ctx.reply('Thanks! Your feedback was sent to the team.'));

bot.command('ban', async (ctx) => {
  const { args } = parseCommand(ctx.message.text);
  const userId = Number(args[0]);
  await ctx.banChatMember(userId);
  return ctx.reply(`User ${userId} is banned.`);
});

bot.hears(/^hello\b/i, (ctx) => ctx.reply('Hello there!'));

bot.action('confirm', async (ctx) => {
  await ctx.answerCbQuery('Confirmed');
  return ctx.editMessageText('Order confirmed.');
});

bot.on('text', (ctx) => {
  const parsed = parseCommand(ctx.message.text);
  if (parsed.command) {
    return ctx.reply(`Unknown command: /${parsed.command}`);
  }
  return ctx.reply('Confirm your order?', Markup.inlineKeyboard([Markup.button.callback('Confirm', 'confirm')]));
});

bot.launch();
console.log('Bot started');
