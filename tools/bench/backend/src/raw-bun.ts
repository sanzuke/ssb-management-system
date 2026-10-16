declare const Bun: any;

Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  hostname: '127.0.0.1',
  async fetch(req: Request) {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/ping') return Response.json({ ok: true });
    if (req.method === 'POST' && url.pathname === '/echo') return Response.json(await req.json());
    return new Response(null, { status: 404 });
  },
});
