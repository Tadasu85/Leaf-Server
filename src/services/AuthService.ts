import crypto from 'crypto';
import { Signature, cryptoUtils } from '@hiveio/dhive';
import { Logger } from '../types';

/**
 * Proves that a socket really belongs to the Hive account it claims.
 *
 * Flow:
 * 1. Client calls GET /auth/challenge?username=alice and gets a one-time message.
 * 2. Client asks Keychain to sign that message with alice's posting key.
 * 3. Client connects with handshake auth { username, challenge, signature }.
 *    The server recovers the public key from the signature and checks that it is
 *    one of alice's posting keys on chain. On success it issues a session token.
 * 4. Reconnects send { username, sessionToken } instead, so Keychain is not
 *    prompted again. Tokens are HMAC-signed with CHAT_AUTH_SECRET, so they stay
 *    valid across server restarts as long as that secret is set.
 */

export type AuthMode = 'required' | 'optional' | 'off';

export interface AuthPayload {
  username?: unknown;
  challenge?: unknown;
  signature?: unknown;
  sessionToken?: unknown;
}

export type AuthResult =
  | { ok: true; username: string; sessionToken: string; method: 'signature' | 'token' | 'guest' }
  | { ok: false; reason: string };

/** Returns the posting public keys (STM...) for an account, or null if the account doesn't exist. */
export type PostingKeyResolver = (username: string) => Promise<string[] | null>;

const CHALLENGE_PREFIX = 'leaf-chat-login';
const USERNAME_RE = /^[a-z][a-z0-9.-]{2,15}$/;
// Hive account names are lowercase only, so a capital G can never clash with a real account.
const GUEST_RE = /^Guest-\d{6}$/;

export function isValidHiveUsername(username: unknown): username is string {
  return typeof username === 'string' && USERNAME_RE.test(username);
}

export function isGuestName(username: unknown): username is string {
  return typeof username === 'string' && GUEST_RE.test(username);
}

export function parseAuthMode(value: string | undefined): AuthMode {
  if (value === 'optional' || value === 'off' || value === 'required') return value;
  return 'required';
}

interface IssuedChallenge {
  username: string;
  expiresAt: number;
}

interface AuthServiceOptions {
  mode?: AuthMode;
  secret?: string;
  resolver?: PostingKeyResolver;
  hiveNode?: string;
  challengeTtlMs?: number;
  sessionTtlMs?: number;
  guestTtlMs?: number;
  now?: () => number;
}

class AuthService {
  private mode: AuthMode;
  private readonly secret: Buffer;
  private resolver: PostingKeyResolver;
  private readonly challengeTtlMs: number;
  private readonly sessionTtlMs: number;
  private readonly guestTtlMs: number;
  private readonly now: () => number;
  private readonly challenges = new Map<string, IssuedChallenge>();
  private readonly keyCache = new Map<string, { keys: string[] | null; fetchedAt: number }>();
  private readonly keyCacheTtlMs = 5 * 60 * 1000;
  private readonly maxOutstandingChallenges = 10000;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(private logger: Logger, options: AuthServiceOptions = {}) {
    this.mode = options.mode ?? 'required';
    this.challengeTtlMs = options.challengeTtlMs ?? 2 * 60 * 1000;
    this.sessionTtlMs = options.sessionTtlMs ?? 7 * 24 * 60 * 60 * 1000;
    this.guestTtlMs = options.guestTtlMs ?? 90 * 24 * 60 * 60 * 1000;
    this.now = options.now ?? Date.now;
    if (options.secret) {
      this.secret = Buffer.from(options.secret, 'utf8');
    } else {
      this.secret = crypto.randomBytes(32);
      if (this.mode !== 'off') {
        this.logger.warn('[Auth] CHAT_AUTH_SECRET is not set; session tokens will stop working after a restart and players will be asked to sign in with Keychain again.');
      }
    }
    const hiveNode = options.hiveNode ?? 'https://api.hive.blog';
    this.resolver = options.resolver ?? ((username) => AuthService.fetchPostingKeys(hiveNode, username));
    if (process.env['NODE_ENV'] !== 'test') {
      this.sweepTimer = setInterval(() => this.sweep(), 60 * 1000);
      this.sweepTimer.unref?.();
    }
  }

  getMode(): AuthMode {
    return this.mode;
  }

  /** For tests and emergency toggling. */
  setMode(mode: AuthMode): void {
    this.mode = mode;
  }

  /** For tests. */
  setResolver(resolver: PostingKeyResolver): void {
    this.resolver = resolver;
    this.keyCache.clear();
  }

  issueChallenge(username: string): { challenge: string; expiresAt: number } | null {
    if (!isValidHiveUsername(username)) return null;
    this.sweep();
    if (this.challenges.size >= this.maxOutstandingChallenges) {
      this.logger.warn('[Auth] Too many outstanding challenges; refusing new ones until some expire');
      return null;
    }
    const issuedAt = this.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    const challenge = `${CHALLENGE_PREFIX}:${username}:${nonce}:${issuedAt}`;
    const expiresAt = issuedAt + this.challengeTtlMs;
    this.challenges.set(challenge, { username, expiresAt });
    return { challenge, expiresAt };
  }

  /**
   * A guest identity for players without a Hive account. The name is chosen by
   * the server and the token is the only way to use it, so guests can't pick
   * each other's names.
   */
  issueGuest(): { username: string; sessionToken: string } {
    const username = `Guest-${crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')}`;
    return { username, sessionToken: this.createSessionToken(username, this.guestTtlMs) };
  }

  async authenticate(payload: AuthPayload | undefined): Promise<AuthResult> {
    const data = payload ?? {};
    const username = data.username;
    if (isGuestName(username)) {
      if (typeof data.sessionToken === 'string' && this.verifySessionToken(username, data.sessionToken)) {
        return { ok: true, username, sessionToken: data.sessionToken, method: 'guest' };
      }
      return { ok: false, reason: 'guest session expired' };
    }
    if (!isValidHiveUsername(username)) {
      return { ok: false, reason: 'invalid username' };
    }

    if (typeof data.sessionToken === 'string' && data.sessionToken) {
      if (this.verifySessionToken(username, data.sessionToken)) {
        return { ok: true, username, sessionToken: data.sessionToken, method: 'token' };
      }
      // Fall through: a stale token plus a fresh signature is still fine.
      if (typeof data.signature !== 'string') {
        return { ok: false, reason: 'session expired' };
      }
    }

    if (typeof data.challenge !== 'string' || typeof data.signature !== 'string') {
      return { ok: false, reason: 'missing credentials' };
    }

    const issued = this.challenges.get(data.challenge);
    // Single use: remove before any await so a replay racing this one also fails.
    this.challenges.delete(data.challenge);
    if (!issued) return { ok: false, reason: 'unknown or used challenge' };
    if (issued.username !== username) return { ok: false, reason: 'challenge issued for another user' };
    if (issued.expiresAt < this.now()) return { ok: false, reason: 'challenge expired' };

    let recoveredKey: string;
    try {
      recoveredKey = Signature.fromString(data.signature)
        .recover(cryptoUtils.sha256(data.challenge))
        .toString();
    } catch {
      return { ok: false, reason: 'malformed signature' };
    }

    let postingKeys: string[] | null;
    try {
      postingKeys = await this.getPostingKeys(username);
    } catch (err) {
      this.logger.warn(`[Auth] Could not load posting keys for ${username}: ${err}`);
      return { ok: false, reason: 'could not reach Hive' };
    }
    if (!postingKeys) return { ok: false, reason: 'account not found' };
    if (!postingKeys.includes(recoveredKey)) return { ok: false, reason: 'signature does not match posting key' };

    return { ok: true, username, sessionToken: this.createSessionToken(username), method: 'signature' };
  }

  createSessionToken(username: string, ttlMs: number = this.sessionTtlMs): string {
    const expiresAt = this.now() + ttlMs;
    const body = `${username}.${expiresAt}`;
    return `${body}.${this.hmac(body)}`;
  }

  verifySessionToken(username: string, token: string): boolean {
    const parts = token.split('.');
    if (parts.length < 3) return false;
    const mac = parts.pop()!;
    const expiresAt = Number(parts.pop());
    const tokenUser = parts.join('.');
    if (tokenUser !== username || !Number.isFinite(expiresAt) || expiresAt < this.now()) return false;
    const expected = this.hmac(`${tokenUser}.${expiresAt}`);
    const a = Buffer.from(mac, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  private hmac(body: string): string {
    return crypto.createHmac('sha256', this.secret).update(body).digest('hex');
  }

  private async getPostingKeys(username: string): Promise<string[] | null> {
    const cached = this.keyCache.get(username);
    if (cached && this.now() - cached.fetchedAt < this.keyCacheTtlMs) return cached.keys;
    const keys = await this.resolver(username);
    this.keyCache.set(username, { keys, fetchedAt: this.now() });
    return keys;
  }

  private sweep(): void {
    const now = this.now();
    for (const [challenge, issued] of this.challenges) {
      if (issued.expiresAt < now) this.challenges.delete(challenge);
    }
  }

  static async fetchPostingKeys(hiveNode: string, username: string): Promise<string[] | null> {
    const response = await fetch(hiveNode, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'condenser_api.get_accounts', params: [[username]], id: 1 }),
      signal: AbortSignal.timeout(5000)
    });
    const data = await response.json() as {
      result?: Array<{ name: string; posting?: { key_auths?: Array<[string, number]> } }>;
    };
    const account = data.result?.find((a) => a.name === username);
    if (!account) return null;
    return (account.posting?.key_auths ?? []).map(([key]) => key);
  }

  cleanup(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    this.challenges.clear();
    this.keyCache.clear();
  }
}

export default AuthService;
