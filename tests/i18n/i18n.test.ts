import { describe, expect, it } from 'vitest';
import { hudTitle, TITLES, titleForLevel } from '../../src/game/levels.js';
import { CATALOGS, isLang, LANGS, pluralForm, t, tn } from '../../src/i18n/index.js';
import { TITLES_EN, TITLES_RU } from '../../src/i18n/titles.js';

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();

describe('catalogs', () => {
  it('every English key exists in every language with the same placeholders', () => {
    for (const lang of LANGS) {
      for (const [key, text] of Object.entries(CATALOGS.en)) {
        const other = CATALOGS[lang][key];
        expect(other, `${lang} is missing ${key}`).toBeDefined();
        if (key.startsWith('quest.') || key.startsWith('subject.')) continue;
        expect(placeholders(other ?? ''), `${lang} placeholders of ${key}`).toEqual(placeholders(text));
      }
    }
  });

  it('quest texts: Russian may word the subject in another case, but only with known placeholders', () => {
    const allowed = new Set(['s', 'sa', 'si', 'stem', 'cycle', 'n', 'dir', 'titles']);
    for (const lang of LANGS) {
      for (const [key, en] of Object.entries(CATALOGS.en)) {
        if (!key.startsWith('quest.') && !key.startsWith('subject.')) continue;
        const own = placeholders(CATALOGS[lang][key] ?? '');
        for (const name of own) expect(allowed.has(name), `${lang} ${key} uses {${name}}`).toBe(true);
        for (const name of placeholders(en)) {
          expect(name === 's' || own.includes(name), `${lang} ${key} lacks {${name}}`).toBe(true);
        }
      }
    }
  });

  it('no language has keys that English lacks', () => {
    for (const lang of LANGS) {
      for (const key of Object.keys(CATALOGS[lang])) expect(CATALOGS.en[key], `en is missing ${key}`).toBeDefined();
    }
  });

  it('there are 50 level titles in each language', () => {
    expect(TITLES_EN).toHaveLength(50);
    expect(TITLES_RU).toHaveLength(50);
    expect(TITLES).toBe(TITLES_EN);
  });
});

describe('t and tn', () => {
  it('fills placeholders, falls back to English and then to the key', () => {
    expect(t('en', 'lang.now', { name: 'English', code: 'en' })).toBe('Language: English (en)');
    expect(t('ru', 'lang.now', { name: 'Русский', code: 'ru' })).toBe('Язык: Русский (ru)');
    expect(t('ru', 'no.such.key')).toBe('no.such.key');
    expect(t('en', 'lang.now')).toBe('Language: {name} ({code})');
  });

  it('picks Russian plural forms', () => {
    const forms = [1, 2, 5, 11, 21, 22, 25, 100, 101, 112].map((n) => pluralForm('ru', n));
    expect(forms).toEqual(['one', 'few', 'many', 'many', 'one', 'few', 'many', 'many', 'one', 'many']);
    expect(pluralForm('en', 1)).toBe('one');
    expect(pluralForm('en', 2)).toBe('many');
  });

  it('counts with the right word', () => {
    expect(tn('ru', 'board.tasks', 1)).toBe('1 задача');
    expect(tn('ru', 'board.tasks', 3)).toBe('3 задачи');
    expect(tn('ru', 'board.tasks', 5)).toBe('5 задач');
    expect(tn('en', 'board.tasks', 1)).toBe('1 tasks');
  });

  it('isLang accepts only ru and en', () => {
    expect(isLang('ru')).toBe(true);
    expect(isLang('de')).toBe(false);
    expect(isLang(5)).toBe(false);
  });
});

describe('level titles', () => {
  it('follow the language and default to English', () => {
    expect(titleForLevel(1)).toBe('Newcomer');
    expect(titleForLevel(1, 'ru')).toBe('Новичок');
    expect(hudTitle(7, 'ru')).toBe('АНАЛИТИК');
    expect(hudTitle(7)).toBe('ANALYST');
    expect(titleForLevel(99, 'ru')).toBe('ЛЕГЕНДА');
  });
});
