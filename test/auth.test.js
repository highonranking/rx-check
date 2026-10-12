const { createAuthenticator } = require('../middleware/auth');

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

describe('auth middleware', () => {
  test('rejects when no keys configured and no-auth not explicitly allowed', () => {
    withEnv({ RXCHECK_API_KEYS: undefined, RXCHECK_ALLOW_NO_AUTH: undefined }, () => {
      const authenticate = createAuthenticator();
      const result = authenticate({ headers: {} });
      expect(result.ok).toBe(false);
    });
  });

  test('allows anonymous access when RXCHECK_ALLOW_NO_AUTH=true and no keys set', () => {
    withEnv({ RXCHECK_API_KEYS: undefined, RXCHECK_ALLOW_NO_AUTH: 'true' }, () => {
      const authenticate = createAuthenticator();
      const result = authenticate({ headers: {} });
      expect(result.ok).toBe(true);
    });
  });

  test('rejects missing key when keys are configured', () => {
    withEnv({ RXCHECK_API_KEYS: 'abc,def' }, () => {
      const authenticate = createAuthenticator();
      const result = authenticate({ headers: {} });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/Missing API key/);
    });
  });

  test('rejects an invalid key', () => {
    withEnv({ RXCHECK_API_KEYS: 'abc,def' }, () => {
      const authenticate = createAuthenticator();
      const result = authenticate({ headers: { 'x-api-key': 'nope' } });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/Invalid API key/);
    });
  });

  test('accepts a valid key via x-api-key header', () => {
    withEnv({ RXCHECK_API_KEYS: 'abc,def' }, () => {
      const authenticate = createAuthenticator();
      const result = authenticate({ headers: { 'x-api-key': 'def' } });
      expect(result.ok).toBe(true);
      expect(result.key).toBe('def');
    });
  });

  test('accepts a valid key via Authorization: Bearer header', () => {
    withEnv({ RXCHECK_API_KEYS: 'abc,def' }, () => {
      const authenticate = createAuthenticator();
      const result = authenticate({ headers: { authorization: 'Bearer abc' } });
      expect(result.ok).toBe(true);
      expect(result.key).toBe('abc');
    });
  });

  test('trims whitespace around configured keys', () => {
    withEnv({ RXCHECK_API_KEYS: ' abc , def ' }, () => {
      const authenticate = createAuthenticator();
      const result = authenticate({ headers: { 'x-api-key': 'abc' } });
      expect(result.ok).toBe(true);
    });
  });
});
