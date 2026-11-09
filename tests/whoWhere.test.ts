import { io as ioClient, Socket } from 'socket.io-client';
import { server, cleanup } from '../src/server';

const TEST_PORT = 4032;
const url = `http://localhost:${TEST_PORT}`;
const connect = (username: string) => ioClient(url, { query: { username }, reconnection: false, forceNew: true });
const waitFor = <T = any>(socket: Socket, event: string) => new Promise<T>((resolve) => socket.once(event, resolve));
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('who with opt-in locations', () => {
  const sockets: Socket[] = [];
  const online = async (username: string, channelId?: string) => {
    const s = connect(username);
    sockets.push(s);
    await waitFor(s, 'connect');
    if (channelId) s.emit('joinChatChannel', { channelId });
    await pause(150);
    return s;
  };
  const who = async (s: Socket) => {
    const list = waitFor<{ players: string[]; locations: Record<string, string> }>(s, 'whoList');
    s.emit('who');
    return list;
  };

  beforeAll((done) => { server.listen(TEST_PORT, done); });
  afterEach(() => { sockets.splice(0).forEach((s) => s.disconnect()); });
  afterAll((done) => { cleanup(); server.close(done); });

  it('lists no rooms unless a player turns where on', async () => {
    const alice = await online('alice', 'ray/room-a');
    await online('bob', 'ray/room-b');
    const list = await who(alice);
    expect(list.players).toEqual(expect.arrayContaining(['alice', 'bob']));
    expect(list.locations).toEqual({});
  });

  it("shows a player's room after where on, and hides it after where off", async () => {
    const alice = await online('alice', 'ray/room-a');
    const bob = await online('bob', 'ray/room-b');
    const ack = waitFor(bob, 'whereVisibleSet');
    bob.emit('setWhereVisible', { visible: true });
    expect(await ack).toEqual({ visible: true });
    expect((await who(alice)).locations).toEqual({ bob: 'ray/room-b' });

    const off = waitFor(bob, 'whereVisibleSet');
    bob.emit('setWhereVisible', { visible: false });
    await off;
    expect((await who(alice)).locations).toEqual({});
  });

  it('forgets the choice when the player disconnects', async () => {
    const alice = await online('alice', 'ray/room-a');
    const bob = await online('bob', 'ray/room-b');
    const ack = waitFor(bob, 'whereVisibleSet');
    bob.emit('setWhereVisible', { visible: true });
    await ack;
    bob.disconnect();
    await pause(150);
    await online('bob', 'ray/room-c');
    expect((await who(alice)).locations).toEqual({});
  });

  it('ignores anything but true or false', async () => {
    const alice = await online('alice', 'ray/room-a');
    alice.emit('setWhereVisible', { visible: 'yes' });
    await pause(100);
    expect((await who(alice)).locations).toEqual({});
  });
});
