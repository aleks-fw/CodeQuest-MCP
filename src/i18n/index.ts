import type { TextRef } from '../types.js';
import { en } from './en.js';
import { ru } from './ru.js';

export type Lang = 'en' | 'ru';
export const LANGS: readonly Lang[] = ['en', 'ru'];
export const isLang = (value: unknown): value is Lang => value === 'en' || value === 'ru';
export const LANGUAGE_NAMES: Record<Lang, string> = { en: 'English', ru: 'Русский' };
export const CATALOGS: Record<Lang, Record<string, string>> = { en, ru };

type Vars = Record<string, string | number>;

/** The text of a key: the language, then English, then the key itself; `{name}` placeholders are filled from vars. */
export function t(lang: Lang, key: string, vars: Vars = {}): string {
  const text = CATALOGS[lang][key] ?? en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === undefined ? whole : String(value);
  });
}

export function pluralForm(lang: Lang, n: number): 'one' | 'few' | 'many' {
  if (lang === 'en') return n === 1 ? 'one' : 'many';
  const last = n % 10;
  const lastTwo = n % 100;
  if (last === 1 && lastTwo !== 11) return 'one';
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'few';
  return 'many';
}

/** `tn('ru', 'board.tasks', 3)` looks up `board.tasks.few` and fills `{n}`. */
export function tn(lang: Lang, key: string, n: number, vars: Vars = {}): string {
  return t(lang, `${key}.${pluralForm(lang, n)}`, { ...vars, n });
}

/** A stored text reference in the given language; `fallback` (the stored English text) when there is none. */
export function renderText(lang: Lang, text: TextRef | undefined, fallback = ''): string {
  if (text === undefined) return fallback;
  // A key that no catalog knows (stored by an older version) is not shown as a key: the stored English text is.
  if (text.parts === undefined && en[text.key] === undefined && CATALOGS[lang][text.key] === undefined) return fallback;
  if (text.parts !== undefined) return text.parts.map((part) => renderText(lang, part)).join('; ');
  return t(lang, text.key, text.vars);
}
