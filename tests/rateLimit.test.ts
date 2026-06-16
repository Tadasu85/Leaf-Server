import express, { Request, Response } from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';

// Mirror of createRateLimiter in server.ts — tests our custom handler behaviour
const createRateLimiter = (windowMs: number, limit: number, message: string) =>
  rateLimit({
    windowMs,
    limit,
    message: { error: message },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({ error: message });
    }
  });

function buildApp(limit: number) {
  const app = express();
  app.set('trust proxy', false);
  app.use(createRateLimiter(60_000, limit, 'Too many requests from this IP'));
  app.get('/test', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('Rate Limiter', () => {
  it('allows requests within the limit', async () => {
    const app = buildApp(5);
    for (let i = 0; i < 5; i++) {
      await request(app).get('/test').expect(200);
    }
  });

  it('returns 429 with error body when limit is exceeded', async () => {
    const app = buildApp(2);
    await request(app).get('/test').expect(200);
    await request(app).get('/test').expect(200);
    const res = await request(app).get('/test');
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'Too many requests from this IP' });
  });

  it('includes standard rate-limit headers', async () => {
    const app = buildApp(5);
    const res = await request(app).get('/test').expect(200);
    // draft-7 combines into a single structured header
    expect(res.headers['ratelimit']).toMatch(/limit=\d+/);
    expect(res.headers['ratelimit']).toMatch(/remaining=\d+/);
  });
});
