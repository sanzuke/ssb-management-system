import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const Echo = z.object({ name: z.string().min(1), age: z.number().int().min(0) });

export const app = new Hono();

app.get('/ping', (c) => c.json({ ok: true }));

app.post('/echo', zValidator('json', Echo), (c) => c.json(c.req.valid('json')));
