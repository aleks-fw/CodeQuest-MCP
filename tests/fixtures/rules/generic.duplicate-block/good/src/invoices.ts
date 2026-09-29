import { type Line, orderTotal } from './orders.js';

export function invoiceTotal(lines: Line[], discountRate: number): number {
  return orderTotal(lines, discountRate);
}
