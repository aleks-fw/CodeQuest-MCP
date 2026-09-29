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

/** Stage 3 adds Python bot frameworks. */
export function countBotHandlers(files: SourceFile[]): number {
  let count = 0;
  for (const file of files) {
    if (file.kind !== 'code' || file.content === null) continue;
    if (file.language !== 'typescript' && file.language !== 'javascript') continue;
    count += file.content.match(BOT_HANDLER)?.length ?? 0;
  }
  return count;
}
