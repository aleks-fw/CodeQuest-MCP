export interface Product {
  id: string;
  name: string;
  priceCents: number;
}

export interface CartItem {
  productId: string;
  name: string;
  priceCents: number;
  quantity: number;
}

// TODO: validate quantity limits before adding to the cart
export function addItem(cart: CartItem[], product: Product, quantity: number): CartItem[] {
  const existing = cart.find((item) => item.productId === product.id);
  if (existing) {
    return cart.map((item) =>
      item.productId === product.id ? { ...item, quantity: item.quantity + quantity } : item,
    );
  }
  return [...cart, { productId: product.id, name: product.name, priceCents: product.priceCents, quantity }];
}

export function removeItem(cart: CartItem[], productId: string): CartItem[] {
  return cart.filter((item) => item.productId !== productId);
}

export function cartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}
