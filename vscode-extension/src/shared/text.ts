import type { Lang, StateDoc } from './state.js';

const EN = {
  check: 'Check quest',
  checking: 'Checking…',
  noProject: 'Open a project folder to see CodeQuest.',
  noData: 'No data',
  owed: '+{xp} XP waiting for a green run',
  quests: 'In progress',
  noQuests: 'No quest taken yet',
  bossHp: 'HP {hp}/{max}',
  lvl: 'LVL',
} as const;
export type UiKey = keyof typeof EN;

const RU: Record<UiKey, string> = {
  check: 'Проверить квест',
  checking: 'Проверяю…',
  noProject: 'Откройте папку проекта, чтобы увидеть CodeQuest.',
  noData: 'Нет данных',
  owed: '+{xp} XP ждут зелёного прогона',
  quests: 'В работе',
  noQuests: 'Квест ещё не взят',
  bossHp: 'HP {hp}/{max}',
  lvl: 'УР.',
};

/** A catalog text; a placeholder without a value stays as it is. */
export function ui(lang: Lang, key: UiKey, vars: Record<string, string | number> = {}): string {
  const template: string = (lang === 'ru' ? RU : EN)[key];
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

export function statusBarText(doc: StateDoc | null, state: 'ok' | 'checking' | 'nodata'): string {
  if (state === 'checking') return '$(sync~spin) CodeQuest: checking…';
  if (doc === null || state === 'nodata') return '⚔ CodeQuest: no data';
  const lvl = ui(doc.lang, 'lvl');
  return doc.xp.max ? `⚔ ${lvl} ${doc.level} · MAX` : `⚔ ${lvl} ${doc.level} · ${doc.xp.current}/${doc.xp.forLevel} XP`;
}

export function statusBarTooltip(doc: StateDoc | null, error?: string): string {
  if (doc === null) return error ?? 'CodeQuest';
  const lines = [`${doc.title} · ${doc.project.name}`];
  if (doc.class !== null) lines.push(doc.class.name);
  if (doc.boss !== null) {
    lines.push(`${doc.boss.name} ${ui(doc.lang, 'bossHp', { hp: doc.boss.hp, max: doc.boss.max })}`);
  }
  if (error !== undefined) lines.push(error);
  return lines.join('\n');
}
