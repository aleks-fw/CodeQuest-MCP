import { isLang, type Lang } from '../i18n/index.js';
import { readJson, writeJsonAtomic } from './atomic.js';
import { configFile, SCHEMA } from './paths.js';

export { configFile };

/** The language of the user's setting; anything unreadable is English. Read on every request, never cached. */
export async function readLanguage(home: string): Promise<Lang> {
  const result = await readJson(configFile(home));
  if (result.status !== 'ok' || typeof result.value !== 'object' || result.value === null) return 'en';
  const { language } = result.value as { language?: unknown };
  return isLang(language) ? language : 'en';
}

export function writeLanguage(home: string, language: Lang): Promise<void> {
  return writeJsonAtomic(configFile(home), { schema: SCHEMA, language });
}
