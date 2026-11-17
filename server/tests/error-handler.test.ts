import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../src/lib/errors.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

function makeApp(handler: express.RequestHandler = (_req, res) => void res.json({ ok: true })) {
  const app = express();
  app.use(express.json({ limit: '1kb' }));
  app.post('/echo', handler);
  app.use(errorHandler);
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('errorHandler', () => {
  it('returns 400 INVALID_JSON for malformed JSON and never logs the body', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await request(makeApp())
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"password": "Secret123", ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      code: 'INVALID_JSON',
      message: 'Request body is not valid JSON',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('Secret123');
  });

  it('returns 413 PAYLOAD_TOO_LARGE for an oversized body', async () => {
    const res = await request(makeApp())
      .post('/echo')
      .send({ text: 'a'.repeat(2048) });

    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('passes AppError status and code through', async () => {
    const res = await request(
      makeApp(() => {
        throw new AppError(400, 'EMPTY_DOCUMENT', 'No readable text was found in the document.');
      }),
    ).post('/echo');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      code: 'EMPTY_DOCUMENT',
      message: 'No readable text was found in the document.',
    });
  });

  it('logs only the error message and stack for unexpected errors, not attached data', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = Object.assign(new Error('boom'), { body: 'password=Secret123' });

    const res = await request(
      makeApp(() => {
        throw error;
      }),
    ).post('/echo');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    expect(JSON.stringify(log.mock.calls)).toContain('boom');
    expect(JSON.stringify(log.mock.calls)).not.toContain('Secret123');
  });
});
