import { t } from '../../i18n/index.js';
import type { TextRef } from '../../types.js';

/** A finding message: the English text (stored and used as the fallback) and the catalog reference to render it in any language. */
export function say(key: string, vars: TextRef['vars'] = {}): { message: string; text: TextRef } {
  return { message: t('en', key, vars), text: { key, vars } };
}
