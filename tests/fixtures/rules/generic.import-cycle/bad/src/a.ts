import { isEven } from './b.js';

export function isOdd(n: number): boolean {
  return n === 0 ? false : isEven(n - 1);
}
