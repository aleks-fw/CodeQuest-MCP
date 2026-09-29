export function total(prices: number[]): number {
  // TODO: apply discounts before summing
  return prices.reduce((sum, price) => sum + price, 0);
}
