import { readFileSync } from 'node:fs';

export function loadConfig(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read ${file}: ${String(error)}`);
  }
}
