import { type Lang, t } from './i18n/index.js';

/** Which catalog text an error has in each language: a key and the values for its `{name}` placeholders. */
export interface ErrorText {
  key: string;
  vars?: Record<string, string | number>;
}

/**
 * An error whose message is safe and useful to show to the user as is. The message is the English text; `text` lets
 * the places that show it speak the user's language (see `errorText`).
 */
export class CodeQuestError extends Error {
  override name = 'CodeQuestError';

  constructor(
    message: string,
    readonly text?: ErrorText,
  ) {
    super(message);
  }
}

/** What to show the user for any failure: a CodeQuest error in the language, anything else as an unexpected error. */
export function errorText(error: unknown, lang: Lang): string {
  if (error instanceof CodeQuestError)
    return error.text === undefined ? error.message : t(lang, error.text.key, error.text.vars);
  return t(lang, 'error.unexpected', { message: error instanceof Error ? error.message : String(error) });
}
