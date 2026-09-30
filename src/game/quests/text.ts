import path from 'node:path';
import { type Lang, t, tn } from '../../i18n/index.js';
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
