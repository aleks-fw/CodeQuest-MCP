import type { Rule } from './types.js';

// bot.catch (telegraf, grammY), polling_error (node-telegram-bot-api), dp.errors / router.errors (aiogram 3),
// add_error_handler (python-telegram-bot).
const ERROR_HANDLER =
  /\bbot\.catch\s*\(|['"`]polling_error['"`]|\b(?:dp|dispatcher|router|\w+_router)\.errors?\b|\badd_error_handler\s*\(/;

export const botNoErrorHandlerRule: Rule = {
  id: 'bot/no-error-handler',
  category: 'reliability',
  severity: 'high',
  pack: 'bot',
  run(ctx) {
    const hasHandler = ctx.files.some(
      (file) => file.kind === 'code' && file.content !== null && ERROR_HANDLER.test(file.content),
    );
    if (hasHandler) return [];
    // Project-level finding: no file, so the id does not change when files move.
    return [{ message: 'The bot has no global error handler; one failing update can stop it silently', key: '' }];
  },
};
