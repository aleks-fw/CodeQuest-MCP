export async function POST(request: Request) {
  const event = JSON.parse(await request.text());
  return Response.json({ received: event.type });
}