import { readFileSync } from 'node:fs';

export const config = JSON.parse(readFileSync('config.json', 'utf8')) as { port: number };
