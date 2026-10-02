import { type Ctx2D, drawScene, EFFECT_MS, SCENE_H, SCENE_W } from '../shared/draw.js';
import { bossRatio, type EffectKind, effectsBetween } from '../shared/scene.js';
import { type Lang, STAT_KEYS, type StateDoc } from '../shared/state.js';
import { ui } from '../shared/text.js';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

type Incoming =
  | { type: 'state'; doc: StateDoc }
  | { type: 'busy'; on: boolean }
  | { type: 'error'; message: string }
  | { type: 'empty'; lang: Lang };

const STAT_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    architecture: 'Architecture',
    testing: 'Testing',
    security: 'Security',
    performance: 'Performance',
    cleanCode: 'Clean Code',
    reliability: 'Reliability',
    maintainability: 'Maintainability',
    bugs: 'Bugs',
    techDebt: 'Tech Debt',
  },
  ru: {
    architecture: 'Архитектура',
    testing: 'Тесты',
    security: 'Безопасность',
    performance: 'Скорость',
    cleanCode: 'Чистый код',
    reliability: 'Надёжность',
    maintainability: 'Поддержка',
    bugs: 'Баги',
    techDebt: 'Тех. долг',
  },
};

const vscode = acquireVsCodeApi();
const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const canvas = byId<HTMLCanvasElement>('scene');
const ctx = canvas.getContext('2d');
canvas.width = SCENE_W;
canvas.height = SCENE_H;

let doc: StateDoc | null = null;
let lang: Lang = 'en';
let busy = false;
let effects: { kind: EffectKind; startedAt: number }[] = [];
let timer: number | undefined;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function frame(): void {
  if (ctx === null) return;
  const now = performance.now();
  effects = effects.filter((effect) => now - effect.startedAt < EFFECT_MS);
  const target: Ctx2D = {
    get fillStyle() {
      return String(ctx.fillStyle);
    },
    set fillStyle(value: string) {
      ctx.fillStyle = value;
    },
    fillRect: (x, y, w, h) => ctx.fillRect(x, y, w, h),
    clearRect: (x, y, w, h) => ctx.clearRect(x, y, w, h),
  };
  drawScene(target, { doc, effects }, now);
}

function startLoop(): void {
  stopLoop();
  frame();
  if (!reduced && document.visibilityState === 'visible') timer = window.setInterval(frame, 125);
}

function stopLoop(): void {
  if (timer !== undefined) window.clearInterval(timer);
  timer = undefined;
}

function bar(name: string, percent: number, extra = ''): HTMLElement {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('span');
  label.className = 'name';
  label.textContent = name;
  const track = document.createElement('div');
  track.className = `bar ${extra}`.trim();
  const fill = document.createElement('i');
  fill.style.width = `${Math.round(Math.min(100, Math.max(0, percent)))}%`;
  track.append(fill);
  row.append(label, track);
  return row;
}

function render(): void {
  byId('check').textContent = ui(lang, busy ? 'checking' : 'check');
  byId<HTMLButtonElement>('check').disabled = busy || doc === null;
  if (doc === null) return;
  byId('title').textContent = `${doc.title}${doc.class === null ? '' : ` · ${doc.class.name}`}`;
  const bars = byId('bars');
  bars.replaceChildren(
    bar(`${ui(lang, 'lvl')} ${doc.level}`, doc.xp.max ? 100 : (doc.xp.current / doc.xp.forLevel) * 100),
    ...(doc.boss === null
      ? []
      : [
          bar(
            `${doc.boss.name} ${ui(lang, 'bossHp', { hp: doc.boss.hp, max: doc.boss.max })}`,
            bossRatio(doc.boss) * 100,
            'boss',
          ),
        ]),
    ...STAT_KEYS.map((key) => bar(STAT_LABELS[lang][key] ?? key, doc?.stats[key] ?? 0)),
  );
  const quests = byId('quests');
  const heading = document.createElement('div');
  heading.textContent = ui(lang, 'quests');
  const list = document.createElement('ul');
  if (doc.quests.inProgress.length === 0) {
    const none = document.createElement('li');
    none.textContent = ui(lang, 'noQuests');
    list.append(none);
  }
  for (const quest of doc.quests.inProgress) {
    const item = document.createElement('li');
    item.textContent = quest.title;
    list.append(item);
  }
  quests.replaceChildren(heading, list);
  byId('owed').textContent = doc.owed.count > 0 ? ui(lang, 'owed', { xp: doc.owed.xp }) : '';
}

window.addEventListener('message', (event: MessageEvent<Incoming>) => {
  const message = event.data;
  if (message.type === 'state') {
    const now = performance.now();
    for (const kind of effectsBetween(doc, message.doc)) effects.push({ kind, startedAt: now });
    doc = message.doc;
    lang = doc.lang;
    busy = doc.busy;
    byId('message').textContent = '';
    render();
    startLoop();
  } else if (message.type === 'busy') {
    busy = message.on;
    render();
  } else if (message.type === 'error') {
    byId('message').textContent = message.message;
  } else if (message.type === 'empty') {
    lang = message.lang;
    doc = null;
    byId('message').textContent = ui(lang, 'noProject');
    render();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') startLoop();
  else stopLoop();
});
byId('check').addEventListener('click', () => vscode.postMessage({ type: 'verify' }));
render();
startLoop();
vscode.postMessage({ type: 'ready' });
