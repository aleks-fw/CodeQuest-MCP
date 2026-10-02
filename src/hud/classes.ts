import type { ClassId, PlayerClass } from '../game/classes.js';
import { type Lang, t } from '../i18n/index.js';

export const classLabel = (id: ClassId, lang: Lang): string => t(lang, `class.${id}`);

/** The name of the class; a hybrid is `A + B`, and Architect with Tester is Test Architect (the spec of the game). */
export function className(player: PlayerClass, lang: Lang): string {
  if (player.secondary === undefined) return classLabel(player.primary, lang);
  const pair = [player.primary, player.secondary];
  if (pair.includes('architect') && pair.includes('tester')) return t(lang, 'class.test-architect');
  return t(lang, 'class.hybrid', { a: classLabel(player.primary, lang), b: classLabel(player.secondary, lang) });
}

/** `Class: Test Architect (Tester 56% · Architect 44%)`: every share with some work, rounded to a whole percent. */
export function classLine(player: PlayerClass, lang: Lang): string {
  const shares = player.shares
    .map((item) => t(lang, 'class.share', { name: classLabel(item.id, lang), percent: Math.round(item.share * 100) }))
    .join(' · ');
  return t(lang, 'class.line', { name: className(player, lang), shares });
}
