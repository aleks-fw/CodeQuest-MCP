import path from 'node:path';
import { type Lang, t } from '../../i18n/index.js';
import type { Quest, Stats } from '../../types.js';
import { CATEGORY_STAT, type Candidate, questIdOf } from './generate.js';
import { questTitle, type TextVars } from './text.js';

export const MAX_OPEN = 8;
export const MAX_PER_CATEGORY = 3;
/** From this stat value up, new Easy and Medium quests of the category are not given (spec §7.6). */
export const ADAPT_FROM = 80;
const EPIC_SIZE = 3;

const SHOP_PATH = /cart|basket|checkout|order|payment|webhook/i;
const DIFFICULTY_ORDER: Quest['difficulty'][] = ['easy', 'medium', 'hard', 'epic'];

export interface BoardInput {
  /** Fresh candidates from generateCandidates, best first. */
  candidates: readonly Candidate[];
  /** Quests that are open now; they stay until completed or obsolete. */
  open: readonly Quest[];
  stats: Stats;
  now: string;
}

export interface Board {
  /** Open quests in board order: by difficulty (Easy → Epic), inside by priority. */
  quests: Quest[];
  /** The quests added this time, in the order they were chosen. */
  opened: Quest[];
}

/**
 * Categories the adaptation rule applies to. Spec §7.6 names every category, but the health stats of a small project sit
 * near 100 whatever single finding it has, so the rule would empty the boards that spec §7.7 and §10 expect. Only Testing,
 * a stat that really measures progress, adapts (stage-8 ruling; widen this set to restore the literal rule).
 */
export const ADAPTED_CATEGORIES: ReadonlySet<Quest['category']> = new Set<Quest['category']>(['testing']);

/** Spec §7.6: a strong stat stops new Easy/Medium quests of its category; Hard, Epic and bugs are always given. */
export function passesAdaptation(candidate: Candidate, stats: Stats): boolean {
  if (!ADAPTED_CATEGORIES.has(candidate.quest.category)) return true;
  const stat = CATEGORY_STAT[candidate.quest.category];
  if (stat === null || stats[stat] < ADAPT_FROM) return true;
  return candidate.quest.difficulty === 'hard' || candidate.quest.difficulty === 'epic';
}

/**
 * The quest board (spec §7.7): open quests stay, free places (8 in all, 3 per category, 1 epic) are filled by priority.
 * Three or more candidates of one area become an epic of the three best of them (spec §7.4).
 */
export function buildBoard(input: BoardInput): Board {
  const { open, stats } = input;
  const taken = new Set(open.flatMap((quest) => allFindings(quest)));
  let pool = input.candidates.filter(
    (candidate) => passesAdaptation(candidate, stats) && !candidate.quest.findings.some((id) => taken.has(id)),
  );
  const hasEpic = open.some((quest) => quest.difficulty === 'epic');
  const epic = hasEpic ? null : formEpic(pool, input.now);
  if (epic) pool = [epic.candidate, ...pool.filter((candidate) => !epic.members.has(candidate.quest.id))];
  pool.sort(byPriority);

  const perCategory = new Map<string, number>();
  for (const quest of open) perCategory.set(quest.category, (perCategory.get(quest.category) ?? 0) + 1);
  let epicOpen = hasEpic;
  const opened: Quest[] = [];
  const priorities = new Map<string, number>(
    input.candidates.map((candidate) => [candidate.quest.id, candidate.priority]),
  );
  if (epic) priorities.set(epic.candidate.quest.id, epic.candidate.priority);

  const queue = [...pool];
  while (queue.length > 0 && open.length + opened.length < MAX_OPEN) {
    const next = queue.shift();
    if (!next) break;
    const { quest } = next;
    const isEpic = quest.difficulty === 'epic';
    const full = (perCategory.get(quest.category) ?? 0) >= MAX_PER_CATEGORY;
    if (full || (isEpic && epicOpen)) {
      // An epic that does not fit gives its quests back as ordinary ones.
      if (isEpic && epic && next === epic.candidate) {
        queue.push(...epic.subtasks);
        queue.sort(byPriority);
      }
      continue;
    }
    if (isEpic) epicOpen = true;
    perCategory.set(quest.category, (perCategory.get(quest.category) ?? 0) + 1);
    opened.push(quest);
  }
  const quests = [...open, ...opened].sort(
    (a, b) =>
      DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty) ||
      (priorities.get(b.id) ?? 0) - (priorities.get(a.id) ?? 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return { quests, opened };
}

/**
 * Open quests that an older version cut from one task (two secrets of one file, two quests) are replaced by the single
 * quest the candidates give now. A quest already taken keeps its start time, its baseline and its place in progress.
 */
export function mergeSplitQuests(quests: readonly Quest[], candidates: readonly Candidate[]): Quest[] {
  const result = [...quests];
  for (const { quest: merged } of candidates) {
    if (merged.findings.length < 2) continue;
    const parts = result.filter(
      (quest) =>
        quest.status === 'open' &&
        quest.difficulty !== 'epic' &&
        quest.template === merged.template &&
        quest.findings.length > 0 &&
        quest.findings.every((id) => merged.findings.includes(id)) &&
        quest.id !== merged.id,
    );
    if (parts.length < 2) continue;
    const base = parts.find((quest) => quest.acceptedAt !== undefined) ?? parts[0];
    if (base === undefined) continue;
    const highFindings = [...new Set([...base.baseline.highFindings, ...merged.baseline.highFindings])].sort();
    const replacement: Quest = {
      ...merged,
      createdAt: base.createdAt,
      ...(base.acceptedAt === undefined ? {} : { acceptedAt: base.acceptedAt }),
      baseline: { ...base.baseline, findings: merged.baseline.findings, highFindings },
    };
    const at = result.indexOf(base);
    result[at] = replacement;
    for (const part of parts) if (part !== base) result.splice(result.indexOf(part), 1);
  }
  return result;
}

interface Epic {
  candidate: Candidate;
  subtasks: Candidate[];
  members: Set<string>;
}

interface Area {
  key: string;
  vars: TextVars;
  template: string;
  pack: Quest['pack'];
}

/** The area of a candidate for epic building; null when it belongs to none (spec §7.4). */
function areaOf(candidate: Candidate, shopOn: boolean): Area | null {
  const { files, quest, template } = candidate;
  if (shopOn && files.some((file) => SHOP_PATH.test(file))) {
    return { key: 'shop', vars: {}, template: 'epic-checkout-master', pack: 'shop' };
  }
  if (template.pack === 'bot') {
    return { key: 'bot', vars: {}, template: 'epic-command-center', pack: 'bot' };
  }
  // Generic areas are top-level folders, and only for quests of Medium and above.
  if (quest.difficulty === 'easy' || files.length === 0) return null;
  const tops = new Set(files.map((file) => (file.includes('/') ? (file.split('/')[0] ?? '') : '')));
  const [top] = [...tops];
  if (tops.size !== 1 || !top) return null;
  return {
    key: `dir:${top}`,
    vars: { dir: `${path.posix.normalize(top)}/` },
    template: 'epic-fortify',
    pack: 'generic',
  };
}

function formEpic(pool: readonly Candidate[], now: string): Epic | null {
  const shopOn = pool.some((candidate) => candidate.template.pack === 'shop');
  const areas = new Map<string, { area: Area; members: Candidate[] }>();
  for (const candidate of pool) {
    const area = areaOf(candidate, shopOn);
    if (!area) continue;
    const entry = areas.get(area.key) ?? { area, members: [] };
    entry.members.push(candidate);
    areas.set(area.key, entry);
  }
  let best: { area: Area; top: Candidate[]; sum: number } | null = null;
  for (const { area, members } of areas.values()) {
    if (members.length < EPIC_SIZE) continue;
    const top = [...members].sort(byPriority).slice(0, EPIC_SIZE);
    const sum = top.reduce((total, member) => total + member.priority, 0);
    if (best === null || sum > best.sum || (sum === best.sum && area.key < best.area.key)) best = { area, top, sum };
  }
  if (!best) return null;
  const { area, top, sum } = best;
  const findings = top.flatMap((member) => member.quest.findings).sort();
  const leadCandidate = top[0];
  if (!leadCandidate) return null;
  const lead = leadCandidate.quest;
  const subtasks = top.map((member) => member.quest);
  const quest: Quest = {
    id: questIdOf(area.template, findings),
    template: area.template,
    pack: area.pack,
    title: t('en', `quest.${area.template}.title`, area.vars),
    description: t('en', 'quest.epic.desc', {
      n: EPIC_SIZE,
      titles: [...new Set(subtasks.map((task) => task.title))].join(', '),
    }),
    vars: area.vars,
    category: lead.category,
    difficulty: 'epic',
    findings,
    // The epic is done when all its subtasks are done; it has no conditions of its own.
    criteria: [],
    subtasks,
    status: 'open',
    createdAt: now,
    baseline: lead.baseline,
  };
  const files = [...new Set(top.flatMap((member) => member.files))].sort();
  // The epic borrows the template of its best subtask; only the pack of the template is read after this point.
  const candidate: Candidate = { quest, priority: sum, files, template: leadCandidate.template };
  return { candidate, subtasks: top, members: new Set(top.map((member) => member.quest.id)) };
}

function byPriority(a: Candidate, b: Candidate): number {
  return b.priority - a.priority || (a.quest.id < b.quest.id ? -1 : a.quest.id > b.quest.id ? 1 : 0);
}

function allFindings(quest: Quest): string[] {
  return [...quest.findings, ...(quest.subtasks ?? []).flatMap((task) => task.findings)];
}

export type FindResult = { quest: Quest } | { error: string };

/** A quest by full id, unique id prefix, short number or title (spec §7.7); ambiguity is an error, not a guess. */
export function findQuest(quests: readonly Quest[], reference: string, lang?: Lang): FindResult {
  const ref = reference.trim().toLowerCase();
  if (ref === '') return { error: 'No quest given' };
  const exact = quests.filter((quest) => quest.id === ref);
  if (exact.length === 1 && exact[0]) return { quest: exact[0] };
  const byPrefix = quests.filter((quest) => quest.id.startsWith(ref));
  if (byPrefix.length === 1 && byPrefix[0]) return { quest: byPrefix[0] };
  if (byPrefix.length > 1) return { error: `"${reference}" matches ${byPrefix.length} quests; type a longer number` };
  // In another language ё and е are the same letter for a person typing a title.
  const fold = (text: string): string => (lang === undefined || lang === 'en' ? text : text.replace(/ё/g, 'е'));
  const byTitle = quests.filter(
    (quest) =>
      fold(quest.title.toLowerCase()) === fold(ref) ||
      (lang !== undefined && fold(questTitle(quest, lang).toLowerCase()) === fold(ref)),
  );
  if (byTitle.length === 1 && byTitle[0]) return { quest: byTitle[0] };
  if (byTitle.length > 1) return { error: `"${reference}" is the title of ${byTitle.length} quests; use the number` };
  return { error: `No quest "${reference}"` };
}
