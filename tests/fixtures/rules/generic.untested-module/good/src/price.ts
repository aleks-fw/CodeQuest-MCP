const TAX_RATE = 0.2;

export function priceWithTax(cents: number): number {
  const tax = Math.round(cents * TAX_RATE);
  const total = cents + tax;
  return total;
}
