import { PrivateKey, cryptoUtils } from '@hiveio/dhive';
import AuthService, { isGuestName, isValidHiveUsername, parseAuthMode } from '../src/services/AuthService';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any;

const aliceKey = PrivateKey.fromSeed('alice-posting');
const malloryKey = PrivateKey.fromSeed('mallory-posting');

const sign = (key: PrivateKey, message: string) => key.sign(cryptoUtils.sha256(message)).toString();

const makeService = (overrides: Record<string, unknown> = {}) => {
  let now = 1_000_000;
  const resolver = jest.fn(async (username: string) =>
    username === 'alice' ? [aliceKey.createPublic().toString()] : username === 'mallory' ? [malloryKey.createPublic().toString()] : null
  );
  const service = new AuthService(logger, {
    mode: 'required',
    secret: 'test-secret',
    resolver,
    now: () => now,
    ...overrides
  });
  return { service, resolver, advance: (ms: number) => { now += ms; } };
};

describe('AuthService', () => {
  describe('helpers', () => {
    it('validates Hive usernames', () => {
      expect(isValidHiveUsername('alice')).toBe(true);
      expect(isValidHiveUsername('hive-109456')).toBe(true);
      expect(isValidHiveUsername('a.b.c')).toBe(true);
      expect(isValidHiveUsername('ab')).toBe(false);
      expect(isValidHiveUsername('Alice')).toBe(false);
      expect(isValidHiveUsername('alice:evil')).toBe(false);
      expect(isValidHiveUsername(42)).toBe(false);
    });

    it('defaults unknown modes to required', () => {
      expect(parseAuthMode(undefined)).toBe('required');
      expect(parseAuthMode('nonsense')).toBe('required');
      expect(parseAuthMode('optional')).toBe('optional');
      expect(parseAuthMode('off')).toBe('off');
    });
  });

  describe('challenges', () => {
    it('issues a challenge bound to the username', () => {
      const { service } = makeService();
      const issued = service.issueChallenge('alice')!;
      expect(issued.challenge.startsWith('leaf-chat-login:alice:')).toBe(true);
      expect(issued.expiresAt).toBeGreaterThan(1_000_000);
    });

    it('refuses invalid usernames', () => {
      const { service } = makeService();
      expect(service.issueChallenge('Not Valid')).toBeNull();
    });
  });

  describe('signature login', () => {
    it('accepts a signature from the account posting key and issues a session token', async () => {
      const { service } = makeService();
      const { challenge } = service.issueChallenge('alice')!;
      const result = await service.authenticate({ username: 'alice', challenge, signature: sign(aliceKey, challenge) });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.username).toBe('alice');
        expect(result.method).toBe('signature');
        expect(service.verifySessionToken('alice', result.sessionToken)).toBe(true);
      }
    });

    it('rejects a signature from a different key', async () => {
      const { service } = makeService();
      const { challenge } = service.issueChallenge('alice')!;
      const result = await service.authenticate({ username: 'alice', challenge, signature: sign(malloryKey, challenge) });
      expect(result).toEqual({ ok: false, reason: 'signature does not match posting key' });
    });

    it('rejects a challenge issued for someone else', async () => {
      const { service } = makeService();
      const { challenge } = service.issueChallenge('mallory')!;
      const result = await service.authenticate({ username: 'alice', challenge, signature: sign(malloryKey, challenge) });
      expect(result).toEqual({ ok: false, reason: 'challenge issued for another user' });
    });

    it('rejects a challenge the server never issued', async () => {
      const { service } = makeService();
      const challenge = 'leaf-chat-login:alice:made-up:1';
      const result = await service.authenticate({ username: 'alice', challenge, signature: sign(aliceKey, challenge) });
      expect(result).toEqual({ ok: false, reason: 'unknown or used challenge' });
    });

    it('rejects a replayed challenge', async () => {
      const { service } = makeService();
      const { challenge } = service.issueChallenge('alice')!;
      const signature = sign(aliceKey, challenge);
      expect((await service.authenticate({ username: 'alice', challenge, signature })).ok).toBe(true);
      expect(await service.authenticate({ username: 'alice', challenge, signature }))
        .toEqual({ ok: false, reason: 'unknown or used challenge' });
    });

    it('rejects an expired challenge', async () => {
      const { service, advance } = makeService();
      const { challenge } = service.issueChallenge('alice')!;
      advance(3 * 60 * 1000);
      const result = await service.authenticate({ username: 'alice', challenge, signature: sign(aliceKey, challenge) });
      expect(result.ok).toBe(false);
    });

    it('rejects a malformed signature', async () => {
      const { service } = makeService();
      const { challenge } = service.issueChallenge('alice')!;
      const result = await service.authenticate({ username: 'alice', challenge, signature: 'not-hex' });
      expect(result).toEqual({ ok: false, reason: 'malformed signature' });
    });

    it('rejects unknown accounts', async () => {
      const { service } = makeService();
      const ghostKey = PrivateKey.fromSeed('ghost');
      const { challenge } = service.issueChallenge('ghost')!;
      const result = await service.authenticate({ username: 'ghost', challenge, signature: sign(ghostKey, challenge) });
      expect(result).toEqual({ ok: false, reason: 'account not found' });
    });

    it('reports Hive outages without accepting the login', async () => {
      const { service } = makeService({ resolver: async () => { throw new Error('timeout'); } });
      const { challenge } = service.issueChallenge('alice')!;
      const result = await service.authenticate({ username: 'alice', challenge, signature: sign(aliceKey, challenge) });
      expect(result).toEqual({ ok: false, reason: 'could not reach Hive' });
    });

    it('caches posting keys between logins', async () => {
      const { service, resolver } = makeService();
      for (let i = 0; i < 2; i++) {
        const { challenge } = service.issueChallenge('alice')!;
        await service.authenticate({ username: 'alice', challenge, signature: sign(aliceKey, challenge) });
      }
      expect(resolver).toHaveBeenCalledTimes(1);
    });

    it('rejects missing credentials', async () => {
      const { service } = makeService();
      expect(await service.authenticate({ username: 'alice' })).toEqual({ ok: false, reason: 'missing credentials' });
      expect(await service.authenticate(undefined)).toEqual({ ok: false, reason: 'invalid username' });
    });
  });

  describe('session tokens', () => {
    it('accepts a valid token without touching Hive', async () => {
      const { service, resolver } = makeService();
      const token = service.createSessionToken('alice');
      const result = await service.authenticate({ username: 'alice', sessionToken: token });
      expect(result).toMatchObject({ ok: true, username: 'alice', method: 'token' });
      expect(resolver).not.toHaveBeenCalled();
    });

    it('rejects a token for another user', async () => {
      const { service } = makeService();
      const token = service.createSessionToken('mallory');
      expect(await service.authenticate({ username: 'alice', sessionToken: token }))
        .toEqual({ ok: false, reason: 'session expired' });
    });

    it('rejects a tampered token', () => {
      const { service } = makeService();
      const token = service.createSessionToken('alice');
      const [user, expires, mac] = token.split('.');
      const forged = `${user}.${Number(expires) + 1000}.${mac}`;
      expect(service.verifySessionToken('alice', forged)).toBe(false);
    });

    it('rejects an expired token', () => {
      const { service, advance } = makeService();
      const token = service.createSessionToken('alice');
      advance(8 * 24 * 60 * 60 * 1000);
      expect(service.verifySessionToken('alice', token)).toBe(false);
    });

    it('keeps tokens valid across restarts when the secret is the same', () => {
      const { service } = makeService();
      const token = service.createSessionToken('alice');
      const { service: restarted } = makeService();
      expect(restarted.verifySessionToken('alice', token)).toBe(true);
      const { service: otherSecret } = makeService({ secret: 'different' });
      expect(otherSecret.verifySessionToken('alice', token)).toBe(false);
    });

    it('handles usernames with dots', () => {
      const { service } = makeService();
      const token = service.createSessionToken('a.b.c');
      expect(service.verifySessionToken('a.b.c', token)).toBe(true);
      expect(service.verifySessionToken('a.b', token)).toBe(false);
    });

    it('falls back to a fresh signature when the token is stale', async () => {
      const { service } = makeService();
      const { challenge } = service.issueChallenge('alice')!;
      const result = await service.authenticate({
        username: 'alice',
        sessionToken: 'alice.1.deadbeef',
        challenge,
        signature: sign(aliceKey, challenge)
      });
      expect(result).toMatchObject({ ok: true, method: 'signature' });
    });
  });
  describe('guests', () => {
    it('recognises guest names, which can never be Hive accounts', () => {
      expect(isGuestName('Guest-004821')).toBe(true);
      expect(isGuestName('guest-004821')).toBe(false);
      expect(isGuestName('Guest-48')).toBe(false);
      expect(isValidHiveUsername('Guest-004821')).toBe(false);
    });

    it('issues a guest name with a token that logs it in', async () => {
      const { service, resolver } = makeService();
      const guest = service.issueGuest();
      expect(isGuestName(guest.username)).toBe(true);
      const result = await service.authenticate({ username: guest.username, sessionToken: guest.sessionToken });
      expect(result).toMatchObject({ ok: true, username: guest.username, method: 'guest' });
      expect(resolver).not.toHaveBeenCalled();
    });

    it('rejects a guest name without its token', async () => {
      const { service } = makeService();
      const guest = service.issueGuest();
      expect(await service.authenticate({ username: guest.username })).toEqual({ ok: false, reason: 'guest session expired' });
      const other = service.issueGuest();
      expect((await service.authenticate({ username: guest.username, sessionToken: other.sessionToken })).ok)
        .toBe(other.username === guest.username);
    });

    it('keeps guest tokens for 90 days', () => {
      const { service, advance } = makeService();
      const guest = service.issueGuest();
      advance(89 * 24 * 60 * 60 * 1000);
      expect(service.verifySessionToken(guest.username, guest.sessionToken)).toBe(true);
      advance(2 * 24 * 60 * 60 * 1000);
      expect(service.verifySessionToken(guest.username, guest.sessionToken)).toBe(false);
    });
  });
});
