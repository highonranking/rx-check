const { createRateLimiter } = require('../middleware/rateLimit');

describe('rate limiter', () => {
  test('allows requests up to the limit', () => {
    const limiter = createRateLimiter({ windowMs: 10000, maxRequests: 3 });
    expect(limiter.check('user-a').ok).toBe(true);
    expect(limiter.check('user-a').ok).toBe(true);
    expect(limiter.check('user-a').ok).toBe(true);
  });

  test('blocks the request that exceeds the limit', () => {
    const limiter = createRateLimiter({ windowMs: 10000, maxRequests: 2 });
    expect(limiter.check('user-b').ok).toBe(true);
    expect(limiter.check('user-b').ok).toBe(true);
    const third = limiter.check('user-b');
    expect(third.ok).toBe(false);
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });

  test('tracks separate keys independently', () => {
    const limiter = createRateLimiter({ windowMs: 10000, maxRequests: 1 });
    expect(limiter.check('user-c').ok).toBe(true);
    expect(limiter.check('user-c').ok).toBe(false); // user-c now over limit
    expect(limiter.check('user-d').ok).toBe(true); // user-d is unaffected
  });

  test('allows requests again after the window passes', () => {
    jest.useFakeTimers();
    const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 1 });
    expect(limiter.check('user-e').ok).toBe(true);
    expect(limiter.check('user-e').ok).toBe(false);

    jest.advanceTimersByTime(1001);

    expect(limiter.check('user-e').ok).toBe(true);
    jest.useRealTimers();
  });

  test('remaining count decreases correctly', () => {
    const limiter = createRateLimiter({ windowMs: 10000, maxRequests: 5 });
    expect(limiter.check('user-f').remaining).toBe(4);
    expect(limiter.check('user-f').remaining).toBe(3);
  });
});
