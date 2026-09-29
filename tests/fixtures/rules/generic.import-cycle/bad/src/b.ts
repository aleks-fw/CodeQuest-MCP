import { isOdd } from './a.js';

export function isEven(n: number): boolean {
  return n === 0 ? true : isOdd(n - 1);
}
