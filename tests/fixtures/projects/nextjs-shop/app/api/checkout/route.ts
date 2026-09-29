import type { CartItem } from '@/lib/cart';
import { createPaymentIntent } from '@/lib/payment';

export async function POST(request: Request): Promise<Response> {
  const { cart } = (await request.json()) as { cart: CartItem[] };
  try {
    const clientSecret = await createPaymentIntent(cart);
    return Response.json({ clientSecret });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
