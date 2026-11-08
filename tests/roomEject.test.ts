import { io as ioClient, Socket } from 'socket.io-client';
import { server, cleanup } from '../src/server';

const TEST_PORT = 4021;
const url = `http://localhost:${TEST_PORT}`;
const channelId = 'ray/glass-room';

const connect = (username: string) =>
  ioClient(url, { query: { username }, reconnection: false, forceNew: true });
const waitFor = <T = any>(socket: Socket, event: string) => new Promise<T>((resolve) => socket.once(event, resolve));
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('room owners removing players', () => {
  const sockets: Socket[] = [];
  const join = async (username: string) => {
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

  it('removes the player, tells the room, and keeps them out', async () => {
    const ray = await join('ray');
    const pest = await join('pest');
    const ejected = waitFor<{ channelId: string; by: string }>(pest, 'ejected');
    const announced = waitFor<{ target: string; by: string }>(ray, 'playerEjected');
    const result = waitFor<{ ok: boolean; message: string }>(ray, 'ejectResult');

    ray.emit('ejectPlayer', { channelId, target: 'pest' });

    expect(await result).toEqual({ ok: true, message: 'You removed pest from this room for 10 minutes.' });
    expect(await ejected).toMatchObject({ channelId, by: 'ray' });
    expect(await announced).toMatchObject({ target: 'pest', by: 'ray' });

    const again = waitFor<{ channelId: string }>(pest, 'ejected');
    pest.emit('joinChatChannel', { channelId });
    expect(await again).toMatchObject({ channelId });
  });

  it("won't let a visitor remove the room's author", async () => {
    await join('ray');
    const visitor = await join('visitor');
    const result = waitFor<{ ok: boolean; message: string }>(visitor, 'ejectResult');
    visitor.emit('ejectPlayer', { channelId, target: 'ray' });
    expect(await result).toEqual({ ok: false, message: 'You can only remove people from rooms you built.' });
  });
});
