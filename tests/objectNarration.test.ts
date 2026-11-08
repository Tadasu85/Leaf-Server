import { io as ioClient, Socket } from 'socket.io-client';
import { server, cleanup } from '../src/server';

const TEST_PORT = 4024;
const url = `http://localhost:${TEST_PORT}`;
const connect = (username: string) => ioClient(url, { query: { username }, reconnection: false, forceNew: true });
const waitFor = <T = any>(socket: Socket, event: string) => new Promise<T>((resolve) => socket.once(event, resolve));
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ROOM = 'ray/glass-room';

describe('room object relay', () => {
  const sockets: Socket[] = [];
  const inRoom = async (username: string, channelId: string) => {
    const s = connect(username);
    sockets.push(s);
    await waitFor(s, 'connect');
    s.emit('joinChatChannel', { channelId });
    await pause(150);
    return s;
  };

  beforeAll((done) => { server.listen(TEST_PORT, done); });
  afterEach(() => { sockets.splice(0).forEach((s) => s.disconnect()); });
  afterAll((done) => { cleanup(); server.close(done); });

  it('tells others in the room which object was used', async () => {
    const alice = await inRoom('alice', ROOM);
    const bob = await inRoom('bob', ROOM);
    const got = waitFor(bob, 'playerUsedObject');
    alice.emit('usedObject', { channelId: ROOM, object: 'brass bell', verb: 'ring' });
    expect(await got).toEqual({ username: 'alice', channelId: ROOM, object: 'brass bell', verb: 'ring' });
  });

  it('ignores rooms the player is not in and malformed names', async () => {
    const alice = await inRoom('alice', 'ray/other-room');
    const bob = await inRoom('bob', ROOM);
    const got: any[] = [];
    bob.on('playerUsedObject', (d) => got.push(d));
    alice.emit('usedObject', { channelId: ROOM, object: 'bell', verb: 'ring' });
    alice.emit('usedObject', { channelId: 'ray/other-room', object: '<b>', verb: 'ring' });
    await pause(300);
    expect(got).toEqual([]);
  });
});
