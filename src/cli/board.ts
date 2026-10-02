import type { Engine, ProjectView } from '../engine/index.js';
import { errorText } from '../errors.js';
import { questTitle } from '../game/quests/text.js';
import { type BoardAction, type BoardUi, parseKey, reconcile, renderCard, renderList, step } from '../hud/board-ui.js';
import { formatHud } from '../hud/hud.js';
import { notificationLines } from '../hud/notifications.js';
import { questText } from '../hud/present.js';
import type { Lang } from '../i18n/index.js';
import { t } from '../i18n/index.js';
import type { Quest } from '../types.js';

/** The screen and keyboard of the board; the real one wraps process.stdin/stdout, tests pass a fake. */
export interface BoardTerminal {
  write(text: string): void;
  columns: number;
  /** Screen height; absent in tests that draw the whole list. */
  rows?: number;
  /** Called when the window changes size; returns a function that stops listening. */
  onResize?(handler: () => void): () => void;
  color: boolean;
  /** Raw key input; returns a function that stops listening. */
  onInput(handler: (chunk: string) => void): () => void;
}

export interface BoardOptions {
  /** How often the board refreshes itself (which also checks the quests that are due). */
  intervalMs: number;
}

const openQuests = (view: ProjectView): Quest[] => view.state.quests.filter((quest) => quest.status === 'open');

/**
 * The interactive board: HUD on top, the open quests under it. ↑↓ choose, Enter opens a card, Enter in the card takes
 * the quest to work, V checks it. Resolves when the user quits. All decisions are in `board-ui`; this is the loop.
 */
export function runBoard(
  engine: Engine,
  request: { projectPath?: string },
  term: BoardTerminal,
  options: BoardOptions,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let view: ProjectView | null = null;
    let ui: BoardUi = { mode: 'list', index: 0 };
    let loadingLang: Lang = 'en';
    let busy = true;
    let stopped = false;

    const lang = (): Lang => view?.lang ?? loadingLang;

    const draw = (): void => {
      const quests = view === null ? [] : openQuests(view);
      const width = Math.max(40, term.columns - 1);
      let body = t(lang(), 'ui.loading');
      if (view !== null) {
        const current = ui.mode === 'card' ? quests.find((quest) => quest.id === ui.questId) : undefined;
        const level = view.state.level;
        const hud = formatHud(view.state.xp, view.state.stats, view.lang, view.playerClass);
        // Rows left under the HUD and its blank line, minus one spare so the last line never scrolls the screen.
        const rows =
          term.rows === undefined ? undefined : Math.max(6, term.rows - hud.split(String.fromCharCode(10)).length - 2);
        const screen =
          current === undefined
            ? renderList(quests, ui, { level, width, color: term.color, lang: lang(), rows, owedXp: view.owed.xp })
            : renderCard(current, { level, color: term.color, lang: lang(), detail: questText(view, current), width });
        body = [hud, '', screen].join('\n');
      }
      const message = ui.mode === 'card' && ui.message !== undefined ? `\n\n${ui.message}` : '';
      // Never more lines than the window has: a taller screen would scroll and push the HUD out of sight.
      const all = (body + message).split('\n');
      const shown = term.rows === undefined ? all : all.slice(0, Math.max(1, term.rows - 1));
      term.write(`\u001b[H${shown.join('\u001b[K\r\n')}\u001b[K\u001b[J`);
    };

    const use = (next: ProjectView, message?: string): void => {
      view = next;
      ui = reconcile({ ...ui, ...(message === undefined ? {} : { message }) }, openQuests(next));
      if (message === undefined) delete ui.message;
    };

    const guarded = async (work: () => Promise<void>): Promise<void> => {
      busy = true;
      try {
        await work();
      } catch (error) {
        ui = { ...ui, message: `codequest: ${errorText(error, lang())}` };
      }
      busy = false;
      draw();
    };

    const perform = async (action: BoardAction): Promise<void> => {
      if (action.type === 'accept') {
        const result = await engine.accept(request, action.quest);
        use(result.view, t(result.view.lang, 'ui.taken', { title: questTitle(result.quest, result.view.lang) }));
      } else if (action.type === 'cancel') {
        const result = await engine.release(request, action.quest);
        use(result.view, t(result.view.lang, 'ui.released', { title: questTitle(result.quest, result.view.lang) }));
      } else if (action.type === 'verify') {
        ui = { ...ui, message: t(lang(), 'ui.checking') };
        draw();
        const next = await engine.verify(request, action.quest);
        const done = next.reports.some((report) => report.verdict.outcome === 'completed');
        use(next, done ? notificationLines(next.events, next.lang).join('\n') : t(next.lang, 'ui.notDone'));
      } else if (action.type === 'refresh') {
        ui = { ...ui, message: t(lang(), 'ui.analysing') };
        draw();
        const refreshed = await engine.refresh(request, true);
        use(refreshed, t(refreshed.lang, 'ui.refreshed'));
      } else if (action.type === 'language') {
        const next = (await engine.language()) === 'ru' ? 'en' : 'ru';
        await engine.setLanguage(next);
        if (view !== null) view = { ...view, lang: next, events: [] };
      }
    };

    const stop = (): void => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      unsubscribe();
      offResize?.();
      term.write('\u001b[?25h\r\n');
      resolve();
    };

    const onInput = (chunk: string): void => {
      const key = parseKey(chunk);
      if (key === null || (busy && key !== 'quit')) return;
      const { ui: next, action } = step(ui, key, view === null ? [] : openQuests(view));
      ui = next;
      if (action?.type === 'quit') stop();
      else if (action === undefined) draw();
      else void guarded(() => perform(action));
    };

    // Every cycle also checks the quests that are due, so XP arrives by itself (spec §8.4).
    const tick = (): void => {
      if (busy || stopped) return;
      void guarded(async () => {
        const next = await engine.view(request);
        const lines = notificationLines(next.events, next.lang);
        use(next, lines.length > 0 ? lines.join('\n') : undefined);
      });
    };

    const timer = setInterval(tick, options.intervalMs);
    const unsubscribe = term.onInput(onInput);
    // The window can change size after the start (a panel dragged, a task terminal resized): clear and draw again.
    const offResize = term.onResize?.(() => {
      term.write('\u001b[2J');
      draw();
    });
    term.write('\u001b[2J\u001b[?25l');
    engine
      .language()
      .then(
        (initial) => {
          loadingLang = initial;
        },
        () => undefined,
      )
      .then(() => {
        draw();
        return guarded(async () => {
          use(await engine.view(request));
        });
      })
      .catch(reject);
  });
}
