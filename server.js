'use strict';

/**
 * HTTP wrapper around the rxcheck-india library — now with API key auth
 * and rate limiting, so it's reasonable to run somewhere other than your
 * own laptop.
 *
 * Config via environment variables:
 *   RXCHECK_API_KEYS        comma-separated list of valid API keys
 *   RXCHECK_ALLOW_NO_AUTH   "true" to skip auth entirely (local dev only)
 *   RXCHECK_RATE_LIMIT      max requests per window per key (default 60)
 *   RXCHECK_RATE_WINDOW_MS  window size in ms (default 60000 = 1 minute)
 *   PORT                    port to listen on (default 3000)
 *
 * Run:
 *   RXCHECK_API_KEYS="dev-key-123" node server.js
 * Then see README.md "Try it with curl" for example requests (now
 * including the Authorization header).
 *
 * This is still a reference/demo server, not a hardened production
 * deployment — e.g. there's no HTTPS termination here (put it behind a
 * reverse proxy / platform that handles TLS), no request logging/audit
 * trail, and the rate limiter is in-memory/single-process only. See
 * README.md "Before you deploy this for real" for the full list.
 */

const http = require('http');
const { resolveToGeneric, checkInteractions, lookupBrand } = require('./src/index');
const { createAuthenticator } = require('./middleware/auth');
const { createRateLimiter } = require('./middleware/rateLimit');

const PORT = process.env.PORT || 3000;
const RATE_LIMIT = parseInt(process.env.RXCHECK_RATE_LIMIT || '60', 10);
const RATE_WINDOW_MS = parseInt(process.env.RXCHECK_RATE_WINDOW_MS || '60000', 10);

const authenticate = createAuthenticator();
const limiter = createRateLimiter({ windowMs: RATE_WINDOW_MS, maxRequests: RATE_LIMIT });

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // /health is intentionally unauthenticated and unlimited, for uptime checks.
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }

  // --- Auth ---
  const authResult = authenticate(req);
  if (!authResult.ok) {
    return sendJson(res, 401, { error: authResult.error });
  }
  const rateLimitKey = authResult.key;

  // --- Rate limiting (per API key) ---
  const rl = limiter.check(rateLimitKey);
  const rateHeaders = {
    'X-RateLimit-Limit': String(RATE_LIMIT),
    'X-RateLimit-Remaining': String(rl.remaining),
  };
  if (!rl.ok) {
    return sendJson(
      res,
      429,
      { error: 'Rate limit exceeded', retryAfterMs: rl.retryAfterMs },
      { ...rateHeaders, 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) }
    );
  }

  try {
    if (req.method === 'GET' && url.pathname === '/resolve') {
      const drug = url.searchParams.get('drug');
      if (!drug) return sendJson(res, 400, { error: 'Missing required query param: drug' }, rateHeaders);
      return sendJson(res, 200, resolveToGeneric(drug), rateHeaders);
    }

    if (req.method === 'GET' && url.pathname === '/lookup') {
      const brand = url.searchParams.get('brand');
      if (!brand) return sendJson(res, 400, { error: 'Missing required query param: brand' }, rateHeaders);
      const entry = lookupBrand(brand);
      if (!entry) return sendJson(res, 404, { error: `Unknown brand: ${brand}` }, rateHeaders);
      return sendJson(res, 200, entry, rateHeaders);
    }

    if (req.method === 'POST' && url.pathname === '/check-interactions') {
      const raw = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(raw || '{}');
      } catch {
        return sendJson(res, 400, { error: 'Invalid JSON body' }, rateHeaders);
      }
      if (!Array.isArray(parsed.drugs)) {
        return sendJson(res, 400, { error: 'Body must be { "drugs": ["Drug1", "Drug2", ...] }' }, rateHeaders);
      }
      return sendJson(res, 200, checkInteractions(parsed.drugs), rateHeaders);
    }

    return sendJson(
      res,
      404,
      { error: 'Not found. Try GET /resolve, GET /lookup, POST /check-interactions' },
      rateHeaders
    );
  } catch (err) {
    return sendJson(res, 500, { error: err.message }, rateHeaders);
  }
});

server.listen(PORT, () => {
  console.log(`rxcheck-india server listening on http://localhost:${PORT}`);
  if (process.env.RXCHECK_ALLOW_NO_AUTH === 'true' && !process.env.RXCHECK_API_KEYS) {
    console.warn('WARNING: running with RXCHECK_ALLOW_NO_AUTH=true — do not use this in production.');
  }
});

module.exports = server;
