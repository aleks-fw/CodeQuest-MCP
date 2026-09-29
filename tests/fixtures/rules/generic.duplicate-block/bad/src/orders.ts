export interface Line {
  price: number;
  quantity: number;
}

export function orderTotal(lines: Line[], discountRate: number): number {
  let subtotal = 0;
  for (const line of lines) {
    subtotal += line.price * line.quantity;
  }
  const discount = subtotal * discountRate;
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * 0.2);
  const shipping = taxable > 100 ? 0 : 10;
  const total = taxable + tax + shipping;
  return Math.max(total, 0);
}
