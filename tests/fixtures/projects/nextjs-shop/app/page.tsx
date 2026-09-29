import { ProductCard } from '@/components/ProductCard';
import type { Product } from '@/lib/cart';

const products: Product[] = [
  { id: 'mug', name: 'Coffee mug', priceCents: 1299 },
  { id: 'tee', name: 'T-shirt', priceCents: 2499 },
  { id: 'cap', name: 'Baseball cap', priceCents: 1999 },
];

export default function HomePage() {
  return (
    <main>
      <img src="/banner.jpg" alt="Autumn sale" width={1200} height={400} />
      <h1>Autumn Shop</h1>
      <ul>
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </ul>
    </main>
  );
}
