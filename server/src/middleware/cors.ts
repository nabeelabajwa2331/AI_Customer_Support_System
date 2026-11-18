import type { RequestHandler } from 'express';

/**
 * Minimal CORS for a bearer-token API: only listed origins get CORS headers.
 * No cookies are used, so credentials are never allowed. Requests from other
 * origins still reach the server but browsers block them from reading the
 * response, and same-origin requests (no Origin header) are unaffected.
 */
export function cors(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);

  return (req, res, next) => {
    const origin = req.headers.origin;

    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Expose-Headers', 'RateLimit, RateLimit-Policy, Retry-After');

      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Max-Age', '600');
        res.status(204).end();
        return;
      }
    }

    next();
  };
}
