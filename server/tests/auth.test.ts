import { describe, it, expect } from 'vitest';
import { signJwt, verifyJwt } from '../src/auth.js';

const TEST_SECRET = 'test-secret-key';

describe('JWT', () => {
  it('signs and verifies a token', () => {
    const token = signJwt({ sub: '01USER', username: 'em' }, TEST_SECRET);
    const payload = verifyJwt(token, TEST_SECRET);
    expect(payload.sub).toBe('01USER');
    expect(payload.username).toBe('em');
  });

  it('rejects invalid tokens', () => {
    expect(() => verifyJwt('garbage', TEST_SECRET)).toThrow();
  });

  it('rejects tokens with wrong secret', () => {
    const token = signJwt({ sub: '01USER', username: 'em' }, TEST_SECRET);
    expect(() => verifyJwt(token, 'wrong-secret')).toThrow();
  });
});
