import { readFileSync } from 'node:fs';

export function loadConfig(file: string): string {
  let text = '{}';
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {}
  return text;
}
