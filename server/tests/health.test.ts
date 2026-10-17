import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/app.js';

const app = createApp();

describe('GET /api/health', () => {
  it('returns 200 with a success payload', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      service: 'ai-customer-support-api',
      status: 'ok',
    });
  });

  it('returns a safe 404 for unknown routes', async () => {
    const res = await request(app).get('/api/definitely-not-a-route');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Not found' });
  });
});
