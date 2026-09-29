import { markOrderPaid } from '@/lib/payment';

interface StripeEvent {
  type: string;
  data: { object: { metadata: { orderId?: string } } };
}

export async function POST(request: Request): Promise<Response> {
  const payload = await request.text();
  const event = JSON.parse(payload) as StripeEvent;
  if (event.type === 'payment_intent.succeeded') {
    const orderId = event.data.object.metadata.orderId;
    if (orderId) {
      markOrderPaid(orderId);
    }
  }
  return new Response(null, { status: 200 });
}
