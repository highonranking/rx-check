'use strict';

/**
 * Minimal, dependency-free API key auth.
 *
 * Keys are read from the RXCHECK_API_KEYS environment variable as a
 * comma-separated list, e.g.:
 *   RXCHECK_API_KEYS="dev-key-123,another-key-456"
 *
 * Each request must send its key as either:
 *   Authorization: Bearer <key>
 *   or
 *   x-api-key: <key>
 *
 * This is intentionally simple (no key rotation, no per-key scopes, no
 * persistence beyond env vars) — enough to stop anonymous/public abuse of a
 * small demo or early-access deployment. For a real production service,
 * swap this for proper issued API keys stored hashed in a database, with
 * per-key scopes and revocation.
 */

function loadKeys() {
  const raw = process.env.RXCHECK_API_KEYS || '';
  return new Set(
    raw
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
  );
}

function extractKey(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  if (req.headers['x-api-key']) {
    return String(req.headers['x-api-key']).trim();
  }
  return null;
}

/**
 * Returns a function you can call per-request: authenticate(req) -> { ok, key, error }
 * Re-reads env on every call to loadKeys() by design, so rotating keys via
 * env/process manager doesn't require a code change (just a restart).
 */
function createAuthenticator() {
  return function authenticate(req) {
    const keys = loadKeys();
    if (keys.size === 0) {
      // No keys configured: fail closed in production-like envs, but allow
      // local/dev use without ceremony when explicitly opted in.
      if (process.env.RXCHECK_ALLOW_NO_AUTH === 'true') {
        return { ok: true, key: 'anonymous-dev' };
      }
      return {
        ok: false,
        error:
          'No API keys configured. Set RXCHECK_API_KEYS, or set RXCHECK_ALLOW_NO_AUTH=true for local development only.',
      };
    }

    const key = extractKey(req);
    if (!key) {
      return { ok: false, error: 'Missing API key. Send it via Authorization: Bearer <key> or x-api-key header.' };
    }
    if (!keys.has(key)) {
      return { ok: false, error: 'Invalid API key.' };
    }
    return { ok: true, key };
  };
}

module.exports = { createAuthenticator, loadKeys, extractKey };
