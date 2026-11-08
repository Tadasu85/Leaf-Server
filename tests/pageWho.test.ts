import { io as ioClient, Socket } from 'socket.io-client';
import { server, cleanup } from '../src/server';

const TEST_PORT = 4022;
const url = `http://localhost:${TEST_PORT}`;
const connect = (username: string) => ioClient(url, { query: { username }, reconnection: false, forceNew: true });
const waitFor = <T = any>(socket: Socket, event: string) => new Promise<T>((resolve) => socket.once(event, resolve));
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('page, whisper and who', () => {
  const sockets: Socket[] = [];
  const online = async (username: string, channelId?: string) => {
    const s = connect(username);
    sockets.push(s);
    await waitFor(s, 'connect');
    if (channelId) s.emit('joinChatChannel', { channelId });
    await pause(150);
    return s;
  };

  beforeAll((done) => { server.listen(TEST_PORT, done); });
  afterEach(() => { sockets.splice(0).forEach((s) => s.disconnect()); });
  afterAll((done) => { cleanup(); server.close(done); });

  it('pages someone in another room', async () => {
    const alice = await online('alice', 'ray/room-a');
    const bob = await online('bob', 'ray/room-b');
    const received = waitFor(bob, 'privateMessage');
    const result = waitFor(alice, 'privateResult');
    alice.emit('page', { target: 'Bob', message: 'meet me at the bell' });
    expect(await received).toEqual({ kind: 'page', from: 'alice', message: 'meet me at the bell' });
    expect(await result).toEqual({ ok: true, kind: 'page', target: 'bob', message: 'meet me at the bell' });
  });

  it('whispers only within the same room', async () => {
    const alice = await online('alice', 'ray/room-a');
    const bob = await online('bob', 'ray/room-a');
    await online('carol', 'ray/room-b');
    const received = waitFor(bob, 'privateMessage');
    const sent = waitFor(alice, 'privateResult');
    alice.emit('whisper', { target: 'bob', message: 'psst' });
    expect(await received).toEqual({ kind: 'whisper', from: 'alice', message: 'psst' });
    expect(await sent).toMatchObject({ ok: true });
    const refused = waitFor(alice, 'privateResult');
    alice.emit('whisper', { target: 'carol', message: 'psst' });
    expect(await refused).toMatchObject({ ok: false, message: "carol isn't here. Use page to reach someone in another room." });
  });

  it('says when someone is offline', async () => {
    const alice = await online('alice');
    const result = waitFor(alice, 'privateResult');
    alice.emit('page', { target: 'nobody', message: 'hi' });
    expect(await result).toMatchObject({ ok: false, message: "nobody isn't online." });
  });

  it('lists who is online', async () => {
    const alice = await online('alice');
    await online('bob');
    const list = waitFor<{ players: string[] }>(alice, 'whoList');
    alice.emit('who');
    expect((await list).players).toEqual(expect.arrayContaining(['alice', 'bob']));
  });
});
