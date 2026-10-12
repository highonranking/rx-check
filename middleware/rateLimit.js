'use strict';

/**
 * Minimal, dependency-free sliding-window rate limiter, keyed per API
 * key (falls back to remote IP if unauthenticated requests are allowed).
 *
 * This is in-memory, so it resets on restart and does NOT share state
 * across multiple server instances/processes. That's fine for a single
 * demo/early-access deployment; if you scale to multiple instances behind
 * a load balancer, swap this for a Redis-backed limiter (e.g. a token
 * bucket in Redis) so all instances see the same counters.
 *
 * Algorithm: fixed-size sliding window using a timestamp array per key.
 * On each request we drop timestamps older than the window, then check
 * if we're still under the limit. O(k) per request where k = requests in
 * the current window for that key — fine at demo/early-access volumes.
 */

function createRateLimiter({ windowMs = 60 * 1000, maxRequests = 60 } = {}) {
  const hits = new Map(); // key -> array of request timestamps (ms)

  function check(key) {
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = hits.get(key);
    if (!timestamps) {
      timestamps = [];
      hits.set(key, timestamps);
    }

    // Drop anything outside the current window
    while (timestamps.length && timestamps[0] < windowStart) {
      timestamps.shift();
    }

    if (timestamps.length >= maxRequests) {
      const retryAfterMs = timestamps[0] + windowMs - now;
      return { ok: false, remaining: 0, retryAfterMs: Math.max(retryAfterMs, 0) };
    }

    timestamps.push(now);
    return { ok: true, remaining: maxRequests - timestamps.length };
  }

  // Periodic cleanup so the Map doesn't grow unbounded with stale keys
  // (e.g. one-off IPs that never come back).
  const cleanupInterval = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of hits.entries()) {
      while (timestamps.length && timestamps[0] < cutoff) timestamps.shift();
      if (timestamps.length === 0) hits.delete(key);
    }
  }, Math.max(windowMs, 30000));
  cleanupInterval.unref?.(); // don't keep the process alive just for cleanup

  return { check, _hits: hits };
}

module.exports = { createRateLimiter };
