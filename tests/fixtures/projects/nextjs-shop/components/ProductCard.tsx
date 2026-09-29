import type { Product } from '@/lib/cart';

export function ProductCard({ product }: { product: Product }) {
  return <li>{product.name}</li>;
}
