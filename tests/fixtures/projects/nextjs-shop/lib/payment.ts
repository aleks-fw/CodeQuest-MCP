import Stripe from 'stripe';
import { type CartItem, cartTotal } from './cart';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');
const paidOrders = new Set<string>();

export async function createPaymentIntent(cart: CartItem[]): Promise<string> {
  const amount = cartTotal(cart);
  if (amount <= 0) {
    throw new Error('Cart is empty');
  }
  const intent = await stripe.paymentIntents.create({ amount, currency: 'usd' });
  return intent.client_secret ?? '';
}

export function markOrderPaid(orderId: string): void {
  paidOrders.add(orderId);
}

export function isOrderPaid(orderId: string): boolean {
  return paidOrders.has(orderId);
}
