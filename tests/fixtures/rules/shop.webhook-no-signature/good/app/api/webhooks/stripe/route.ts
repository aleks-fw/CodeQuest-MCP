import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature') ?? '';
  const event = stripe.webhooks.constructEvent(await request.text(), signature, process.env.WEBHOOK_SECRET ?? '');
  return Response.json({ received: event.type });
}