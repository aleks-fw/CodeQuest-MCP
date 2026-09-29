import type { SourceFile } from './files.js';

// Telegraf/grammY (command, hears, action, on, start, help) and node-telegram-bot-api (onText).
const BOT_HANDLER = /\b(?:bot|composer|router)\.(?:command|hears|action|on|start|help|onText)\s*\(/g;

/** fileLines feeds "shrink this file" quests; codeLines ignores blank lines so reformatting does not count. */
export function measureLines(files: SourceFile[]): { codeLines: number; fileLines: Record<string, number> } {
  let codeLines = 0;
  const entries: [string, number][] = [];
  for (const file of files) {
    if (file.kind !== 'code' && file.kind !== 'test') continue;
    entries.push([file.path, file.lines.length]);
    if (file.kind === 'code') codeLines += file.lines.filter((line) => line.trim() !== '').length;
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { codeLines, fileLines: Object.fromEntries(entries) };
}

// aiogram (`@dp.message(`, `@router.callback_query(`, `dp.message.register(`), python-telegram-bot (`*Handler(`),
// Pyrogram (`@app.on_message(`) and Telethon (`@client.on(`).
const PY_BOT_HANDLERS: readonly RegExp[] = [
  /^[ \t]*@\w+\.(?:message|edited_message|callback_query|inline_query|channel_post|chat_member|my_chat_member|poll|pre_checkout_query|shipping_query)\s*\(/gm,
  /\b\w+\.(?:message|callback_query|inline_query)\.register\s*\(/g,
  /\b(?:CommandHandler|MessageHandler|CallbackQueryHandler|InlineQueryHandler|ChatMemberHandler|PollHandler)\s*\(/g,
  /^[ \t]*@\w+\.on_(?:message|callback_query|inline_query)\s*\(/gm,
  /^[ \t]*@\w+\.on\s*\(/gm,
];

/** Handler registrations of Telegram bot frameworks in JS/TS and Python code. */
export function countBotHandlers(files: SourceFile[]): number {
  return files.reduce((sum, file) => sum + countFileHandlers(file), 0);
}

/** Registrations in one code file; tests, configs and other languages count 0. */
export function countFileHandlers(file: SourceFile): number {
  if (file.kind !== 'code' || file.content === null) return 0;
  if (file.language === 'python') {
    return PY_BOT_HANDLERS.reduce((sum, pattern) => sum + (file.content?.match(pattern)?.length ?? 0), 0);
  }
  if (file.language === 'typescript' || file.language === 'javascript') {
    return file.content.match(BOT_HANDLER)?.length ?? 0;
  }
  return 0;
}
