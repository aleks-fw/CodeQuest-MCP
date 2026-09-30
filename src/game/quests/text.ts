import path from 'node:path';
import { CATALOGS, type Lang, t, tn } from '../../i18n/index.js';
import type { Quest } from '../../types.js';
import type { Group } from './templates.js';

export type TextVars = Record<string, string | number>;
type Case = 'gen' | 'acc' | 'loc';

const stemOf = (file: string): string => path.posix.basename(file).replace(/\.[^.]+$/, '');

/** What a group of findings is about, kept as data so the text can be worded in any language later. */
export function groupVars(group: Group): TextVars {
  const [first] = group.files;
  let sk = 'project';
  let sv = '';
  if (first !== undefined && group.files.length === 1) {
    sk = 'file';
    sv = path.posix.basename(first);
  } else if (first !== undefined) {
    const dirs = new Set(group.files.map((file) => path.posix.dirname(file)));
    const [dir] = [...dirs];
    if (dirs.size !== 1) sk = 'files';
    else if (dir === '.') sk = 'root';
    else {
      sk = 'dir';
      sv = `${dir}/`;
    }
  }
  return {
    sk,
    sv,
    n: group.files.length,
    stem: first === undefined ? '' : stemOf(first),
    cycle: group.findings[0]?.file ?? '',
  };
}

function subjectIn(lang: Lang, vars: TextVars, form: Case): string {
  const kind = String(vars.sk ?? 'project');
  if (kind === 'file' || kind === 'dir') return String(vars.sv ?? '');
  if (kind === 'files') return tn(lang, `subject.files.${form}`, Number(vars.n ?? 0));
  return t(lang, `subject.${kind}.${form}`);
}

/** The placeholders of a quest text: the subject in three cases, and the rest of the variables as they are. */
export function renderVars(lang: Lang, vars: TextVars): TextVars {
  const cycle = String(vars.cycle ?? '');
  return {
    ...vars,
    s: subjectIn(lang, vars, 'gen'),
    sa: subjectIn(lang, vars, 'acc'),
    si: subjectIn(lang, vars, 'loc'),
    cycle: cycle === '' ? t(lang, 'subject.project.acc') : cycle,
  };
}

export function templateText(lang: Lang, templateId: string, part: 'title' | 'desc', vars: TextVars): string {
  return t(lang, `quest.${templateId}.${part}`, renderVars(lang, vars));
}

function textOf(quest: Quest, lang: Lang, part: 'title' | 'desc'): string | undefined {
  const epic = quest.template.startsWith('epic-');
  const key = epic && part === 'desc' ? 'quest.epic.desc' : `quest.${quest.template}.${part}`;
  if (!(key in CATALOGS[lang])) return undefined;
  if (epic && part === 'desc') {
    const titles = (quest.subtasks ?? []).map((task) => questTitle(task, lang)).join(', ');
    return t(lang, key, { n: (quest.subtasks ?? []).length, titles });
  }
  // The epics without a directory need no vars; an old Fortify epic waits for its backfill.
  if (quest.vars === undefined && !(epic && quest.template !== 'epic-fortify')) return undefined;
  return templateText(lang, quest.template, part, quest.vars ?? {});
}

/** The title in a language: English is the stored text; others are rendered from template and vars, else stay English. */
export const questTitle = (quest: Quest, lang: Lang): string =>
  lang === 'en' ? quest.title : (textOf(quest, lang, 'title') ?? quest.title);
export const questDescription = (quest: Quest, lang: Lang): string =>
  lang === 'en' ? quest.description : (textOf(quest, lang, 'desc') ?? quest.description);

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A regex for an English catalog text: each placeholder becomes a capture group; `names` lists them in order. */
function patternOf(text: string): { regex: RegExp; names: string[] } {
  const names: string[] = [];
  const source = text
    .split(/(\{\w+\})/)
    .map((part) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1];
      if (name === undefined) return escapeRegex(part);
      names.push(name);
      return '(.+)';
    })
    .join('');
  return { regex: new RegExp(`^${source}$`), names };
}

function capture(text: string, template: string, part: 'title' | 'desc'): Record<string, string> | undefined {
  const source = CATALOGS.en[`quest.${template}.${part}`];
  if (source === undefined) return undefined;
  const { regex, names } = patternOf(source);
  const match = regex.exec(text);
  if (match === null) return undefined;
  const found: Record<string, string> = {};
  names.forEach((name, index) => {
    found[name] ??= match[index + 1] ?? '';
  });
  return found;
}

/** The vars of an old quest, read back from its stored English text (built from the same catalog). */
function varsFromText(quest: Quest): TextVars | undefined {
  try {
    const desc = capture(quest.description, quest.template, 'desc');
    if (desc === undefined) return undefined;
    const vars: TextVars = { sk: 'project', sv: '', n: 0, stem: '', cycle: '' };
    const subject = desc.s ?? desc.sa ?? desc.si;
    if (subject !== undefined) {
      const count = /^(\d+) files$/.exec(subject)?.[1];
      if (subject === 'the root folder') vars.sk = 'root';
      else if (subject === 'the project') vars.sk = 'project';
      else if (count !== undefined) {
        vars.sk = 'files';
        vars.n = Number(count);
      } else if (subject.endsWith('/')) {
        vars.sk = 'dir';
        vars.sv = subject;
      } else {
        vars.sk = 'file';
        vars.sv = subject;
        vars.n = 1;
      }
    }
    if (desc.cycle !== undefined && desc.cycle !== 'the project') vars.cycle = desc.cycle;
    if (
      `quest.${quest.template}.title` in CATALOGS.en &&
      CATALOGS.en[`quest.${quest.template}.title`]?.includes('{stem}')
    ) {
      const title = capture(quest.title, quest.template, 'title');
      if (title === undefined) return undefined;
      vars.stem = title.stem ?? '';
    }
    return vars;
  } catch {
    return undefined;
  }
}

/**
 * Quests saved before `vars` existed get them again: from the fresh candidate of the same id, from the epic's title,
 * or else from the stored English text (a batched quest whose findings changed, a finished subtask of an epic).
 */
export function backfillVars(open: Quest[], candidates: readonly { quest: Quest }[]): void {
  const byId = new Map(candidates.map((candidate) => [candidate.quest.id, candidate.quest.vars]));
  const fill = (quest: Quest): void => {
    if (quest.vars === undefined) {
      const known = byId.get(quest.id);
      if (known !== undefined) quest.vars = known;
      else if (quest.template === 'epic-checkout-master' || quest.template === 'epic-command-center') quest.vars = {};
      else if (quest.template === 'epic-fortify') quest.vars = { dir: quest.title.replace(/^Fortify /, '') };
      else quest.vars = varsFromText(quest);
    }
    for (const task of quest.subtasks ?? []) fill(task);
  };
  for (const quest of open) fill(quest);
}
