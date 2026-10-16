import { serve } from '@hono/node-server';
import { app } from './hono-app.js';

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000), hostname: '127.0.0.1' });
