import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { EventType, GameEvent } from '../types.js';

export interface NewEvent {
  at: string;
  type: EventType;
  data?: Record<string, unknown>;
}

export interface JournalRead {
  events: GameEvent[];
  /** Lines that were not valid events (for example a line cut off by a crash). */
  skipped: number;
}

/** Reads events.jsonl; a broken line is skipped, not fatal. */
export async function readEvents(file: string): Promise<JournalRead> {
  let text = '';
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const events: GameEvent[] = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const event = parseEvent(line);
    if (event) events.push(event);
    else skipped++;
  }
  return { events, skipped };
}

/** Appends events with the next sequence numbers. Call it under the project lock: numbering reads the file first. */
export async function appendEvents(file: string, entries: NewEvent[]): Promise<GameEvent[]> {
  if (entries.length === 0) return [];
  await mkdir(path.dirname(file), { recursive: true });
  const { events } = await readEvents(file);
  let seq = events.reduce((max, event) => Math.max(max, event.seq), 0);
  const created = entries.map((entry): GameEvent => {
    seq++;
    return { seq, at: entry.at, type: entry.type, data: entry.data ?? {} };
  });
  await appendFile(file, `${created.map((event) => JSON.stringify(event)).join('\n')}\n`);
  return created;
}

/** Sum of the `amount` of `xp` events: the truth that state.json's XP is only a cache of. */
export function sumXp(events: readonly GameEvent[]): number {
  let total = 0;
  for (const event of events) {
    if (event.type === 'xp' && typeof event.data.amount === 'number') total += event.data.amount;
  }
  return total;
}

function parseEvent(line: string): GameEvent | null {
  try {
    const value = JSON.parse(line) as Partial<GameEvent> | null;
    if (
      value !== null &&
      typeof value === 'object' &&
      Number.isInteger(value.seq) &&
      typeof value.at === 'string' &&
      typeof value.type === 'string' &&
      typeof value.data === 'object' &&
      value.data !== null
    ) {
      return value as GameEvent;
    }
  } catch {
    // not JSON
  }
  return null;
}
