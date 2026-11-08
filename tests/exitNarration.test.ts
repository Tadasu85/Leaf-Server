import { io as ioClient, Socket } from 'socket.io-client';
import { server, cleanup } from '../src/server';

const TEST_PORT = 4023;
const url = `http://localhost:${TEST_PORT}`;
const connect = (username: string) => ioClient(url, { query: { username }, reconnection: false, forceNew: true });
const waitFor = <T = any>(socket: Socket, event: string) => new Promise<T>((resolve) => socket.once(event, resolve));
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const A = 'ray/glass-room';
const B = 'ray/bell-loft';

describe('exit narration relay', () => {
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

  it('tells the room left and the room entered which exit was used', async () => {
    const mover = await inRoom('alice', A);
    const watcherA = await inRoom('bob', A);
    const watcherB = await inRoom('carol', B);
    const left = waitFor(watcherA, 'playerUsedExit');
    const arrived = waitFor(watcherB, 'playerArrivedVia');
    mover.emit('usedExit', { from: A, to: B, direction: 'up', othersLeave: true, othersArrive: true });
    expect(await left).toEqual({ username: 'alice', channelId: A, direction: 'up' });
    expect(await arrived).toEqual({ username: 'alice', channelId: B, from: A, direction: 'up' });
  });

  it('relays nothing for a room the mover is not in, or without lines', async () => {
    const mover = await inRoom('alice', A);
    const watcherB = await inRoom('carol', B);
    const got: any[] = [];
    watcherB.on('playerUsedExit', (d) => got.push(d));
    watcherB.on('playerArrivedVia', (d) => got.push(d));
    mover.emit('usedExit', { from: B, to: A, direction: 'down', othersLeave: true, othersArrive: true });
    mover.emit('usedExit', { from: A, to: B, direction: 'up', othersLeave: false, othersArrive: false });
    mover.emit('usedExit', { from: A, to: B, direction: 'Up Stairs!', othersArrive: true });
    await pause(300);
    expect(got).toEqual([]);
  });
});
