import { type CartItem, cartTotal } from '@/lib/cart';
import { formatPrice } from '@/lib/format';

const demoCart: CartItem[] = [
  { productId: 'mug', name: 'Coffee mug', priceCents: 1299, quantity: 2 },
  { productId: 'tee', name: 'T-shirt', priceCents: 2499, quantity: 1 },
];

export default function CartPage() {
  return (
    <main>
      <h1>Your cart</h1>
      <ul>
        {demoCart.map((item) => (
          <li key={item.productId}>
            {item.name} x {item.quantity}: {formatPrice(item.priceCents * item.quantity)}
          </li>
        ))}
      </ul>
      <p>Total: {formatPrice(cartTotal(demoCart))}</p>
      <form action="/api/checkout" method="post">
        <button type="submit">Pay</button>
      </form>
    </main>
  );
}
