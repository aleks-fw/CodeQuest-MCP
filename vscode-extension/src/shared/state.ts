export type Lang = 'en' | 'ru';

export const STAT_KEYS = [
  'architecture',
  'testing',
  'security',
  'performance',
  'cleanCode',
  'reliability',
  'maintainability',
  'bugs',
  'techDebt',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export interface StateDoc {
  version: 1;
  lang: Lang;
  project: { name: string; path: string };
  level: number;
  xp: { current: number; forLevel: number; max: boolean };
  title: string;
  stats: Record<StatKey, number>;
  class: { id: string; secondary?: string; name: string } | null;
  busy: boolean;
  owed: { count: number; xp: number };
  quests: { open: number; done: number; inProgress: { id: string; title: string; difficulty: string }[] };
  boss: { id: string; name: string; hp: number; max: number } | null;
  bossesActive: number;
}

export type CliResult = { ok: true; doc: StateDoc } | { ok: false; message: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const obj = (value: unknown): Record<string, unknown> => (isObject(value) ? value : {});

/** A document from the CLI with every field made safe; null when it is not a version-1 document at all. */
export function parseState(raw: unknown): StateDoc | null {
  if (!isObject(raw) || raw.version !== 1) return null;
  const xp = obj(raw.xp);
  const project = obj(raw.project);
  const stats = obj(raw.stats);
  const quests = obj(raw.quests);
  const owed = obj(raw.owed);
  const cls = obj(raw.class);
  const boss = obj(raw.boss);
  const inProgress = Array.isArray(quests.inProgress) ? quests.inProgress : [];
  return {
    version: 1,
    lang: raw.lang === 'ru' ? 'ru' : 'en',
    project: { name: str(project.name), path: str(project.path) },
    level: Math.max(1, Math.floor(num(raw.level, 1))),
    xp: { current: Math.max(0, num(xp.current)), forLevel: num(xp.forLevel, 500) || 500, max: xp.max === true },
    title: str(raw.title),
    stats: Object.fromEntries(STAT_KEYS.map((key) => [key, Math.min(100, Math.max(0, num(stats[key])))])) as Record<
      StatKey,
      number
    >,
    class:
      typeof cls.id === 'string' && cls.id !== ''
        ? {
            id: cls.id,
            ...(typeof cls.secondary === 'string' ? { secondary: cls.secondary } : {}),
            name: str(cls.name, cls.id),
          }
        : null,
    busy: raw.busy === true,
    owed: { count: Math.max(0, num(owed.count)), xp: Math.max(0, num(owed.xp)) },
    quests: {
      open: Math.max(0, num(quests.open)),
      done: Math.max(0, num(quests.done)),
      inProgress: inProgress.flatMap((item) =>
        isObject(item) && typeof item.id === 'string'
          ? [{ id: item.id, title: str(item.title, item.id), difficulty: str(item.difficulty, 'easy') }]
          : [],
      ),
    },
    boss:
      typeof boss.id === 'string' && boss.id !== ''
        ? {
            id: boss.id,
            name: str(boss.name, boss.id),
            hp: Math.max(0, num(boss.hp)),
            max: Math.max(1, num(boss.max, 1)),
          }
        : null,
    bossesActive: Math.max(0, Math.floor(num(raw.bossesActive))),
  };
}

/** The result of one CLI call: a document, or a message to show instead (never throws). */
export function parseCliOutput(stdout: string): CliResult {
  const line = stdout
    .split('\n')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .at(-1);
  if (line === undefined) return { ok: false, message: 'CodeQuest printed nothing' };
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return { ok: false, message: `CodeQuest printed something unexpected: ${line.slice(0, 120)}` };
  }
  if (isObject(raw) && isObject(raw.error)) return { ok: false, message: str(raw.error.message, 'CodeQuest failed') };
  const doc = parseState(raw);
  return doc === null ? { ok: false, message: 'CodeQuest printed an unknown document' } : { ok: true, doc };
}
