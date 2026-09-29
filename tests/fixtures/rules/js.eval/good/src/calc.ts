// eval(expression) was removed: parse numbers explicitly instead.
export function calculate(expression: string): number {
  return Number.parseFloat(expression);
}
