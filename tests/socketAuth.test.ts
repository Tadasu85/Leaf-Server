import { io as ioClient, Socket } from 'socket.io-client';
import request from 'supertest';
import { PrivateKey, cryptoUtils } from '@hiveio/dhive';
import { app, server, cleanup, authService } from '../src/server';

const TEST_PORT = 4013;
const url = `http://localhost:${TEST_PORT}`;
const aliceKey = PrivateKey.fromSeed('socket-alice');
const sign = (message: string) => aliceKey.sign(cryptoUtils.sha256(message)).toString();

const connect = (opts: Record<string, unknown>) =>
  ioClient(url, { reconnection: false, forceNew: true, ...opts });

const waitFor = <T = any>(socket: Socket, event: string) =>
  new Promise<T>((resolve) => socket.once(event, resolve));

describe('Socket chat login', () => {
  const sockets: Socket[] = [];
  const track = (s: Socket) => { sockets.push(s); return s; };

  beforeAll((done) => {
    authService.setResolver(async (username) =>
      username === 'alice' ? [aliceKey.createPublic().toString()] : null
    );
    server.listen(TEST_PORT, done);
  });

  afterEach(() => {
    sockets.splice(0).forEach((s) => s.disconnect());
    authService.setMode('off');
  });

  afterAll((done) => {
    cleanup();
    server.close(done);
  });

  const signedAuth = async () => {
    const res = await request(app).get('/auth/challenge').query({ username: 'alice' });
    return { username: 'alice', challenge: res.body.challenge, signature: sign(res.body.challenge) };
  };

  it('serves a challenge for a valid username', async () => {
    authService.setMode('required');
    const res = await request(app).get('/auth/challenge').query({ username: 'alice' });
    expect(res.status).toBe(200);
    expect(res.body.challenge).toMatch(/^leaf-chat-login:alice:/);
    expect(res.body.mode).toBe('required');
  });

  it('rejects a challenge request with a bad username', async () => {
    const res = await request(app).get('/auth/challenge').query({ username: 'BAD NAME' });
    expect(res.status).toBe(400);
  });

  it('accepts a signed login and returns a session token', async () => {
    authService.setMode('required');
    const socket = track(connect({ auth: await signedAuth() }));
    const authed = await waitFor<{ username: string; sessionToken: string }>(socket, 'authenticated');
    expect(authed.username).toBe('alice');
    expect(authService.verifySessionToken('alice', authed.sessionToken)).toBe(true);
  });

  it('reconnects with the session token alone', async () => {
    authService.setMode('required');
    const first = track(connect({ auth: await signedAuth() }));
    const { sessionToken } = await waitFor<{ sessionToken: string }>(first, 'authenticated');
    first.disconnect();
    const second = track(connect({ auth: { username: 'alice', sessionToken } }));
    const authed = await waitFor<{ username: string }>(second, 'authenticated');
    expect(authed.username).toBe('alice');
  });

  it('refuses a plain ?username= connection when login is required', async () => {
    authService.setMode('required');
    const socket = track(connect({ query: { username: 'alice' } }));
    const err = await waitFor<Error>(socket, 'connect_error');
    expect(err.message).toBe('auth_failed: missing credentials');
  });

  it('refuses a signature that does not match the claimed account', async () => {
    authService.setMode('required');
    const res = await request(app).get('/auth/challenge').query({ username: 'alice' });
    const wrong = PrivateKey.fromSeed('impostor').sign(cryptoUtils.sha256(res.body.challenge)).toString();
    const socket = track(connect({ auth: { username: 'alice', challenge: res.body.challenge, signature: wrong } }));
    const err = await waitFor<Error>(socket, 'connect_error');
    expect(err.message).toBe('auth_failed: signature does not match posting key');
  });

  it('ignores a spoofed ?username= on a verified socket', async () => {
    authService.setMode('required');
    const socket = track(connect({ auth: await signedAuth(), query: { username: 'hive-109456' } }));
    const authed = await waitFor<{ username: string }>(socket, 'authenticated');
    expect(authed.username).toBe('alice');
  });

  it('does not let a verified socket rename itself with register', async () => {
    authService.setMode('required');
    const socket = track(connect({ auth: await signedAuth() }));
    await waitFor(socket, 'authenticated');
    socket.emit('register', { username: 'hive-109456' });
    const response = await waitFor<{ success: boolean }>(socket, 'registered');
    expect(response.success).toBe(false);
  });

  it('still lets unsigned clients in when login is optional', async () => {
    authService.setMode('optional');
    const socket = track(connect({ query: { username: 'legacyuser' } }));
    await waitFor(socket, 'connect');
    expect(socket.connected).toBe(true);
  });
  describe('guests', () => {
    const newGuest = async () => (await request(app).get('/auth/guest')).body as { username: string; sessionToken: string };

    it('hands out a guest name and token', async () => {
      authService.setMode('required');
      const guest = await newGuest();
      expect(guest.username).toMatch(/^Guest-\d{6}$/);
      expect(typeof guest.sessionToken).toBe('string');
    });

    it('has no guest accounts when chat login is off', async () => {
      authService.setMode('off');
      const res = await request(app).get('/auth/guest');
      expect(res.status).toBe(404);
    });

    it('lets a guest join chat with its token', async () => {
      authService.setMode('required');
      const guest = await newGuest();
      const socket = track(connect({ auth: guest }));
      const authed = await waitFor<{ username: string }>(socket, 'authenticated');
      expect(authed.username).toBe(guest.username);
    });

    it('refuses a made-up guest name', async () => {
      authService.setMode('required');
      const socket = track(connect({ auth: { username: 'Guest-123456', sessionToken: 'Guest-123456.9999999999999.00' } }));
      const err = await waitFor<Error>(socket, 'connect_error');
      expect(err.message).toBe('auth_failed: guest session expired');
    });

    it('limits how fast a guest can talk', async () => {
      authService.setMode('required');
      const guest = await newGuest();
      const socket = track(connect({ auth: guest }));
      await waitFor(socket, 'authenticated');
      const errors: string[] = [];
      socket.on('error', (e: { message: string }) => errors.push(e.message));
      for (let i = 0; i < 10; i++) socket.emit('chatMessage', { channelId: 'raymonjohnstone/genesis-scaffold-precipice', message: `hi ${i}` });
      await new Promise((r) => setTimeout(r, 200));
      expect(errors.filter((m) => m.startsWith('Guests can send'))).toHaveLength(2);
    });
  });
});
