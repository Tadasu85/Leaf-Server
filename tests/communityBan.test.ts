import { io as ioClient, Socket } from 'socket.io-client';
import CommunityBanService from '../src/services/CommunityBanService';
import { server, cleanup, authService, communityBans, kickBanned } from '../src/server';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any;

describe('CommunityBanService', () => {
  it('bans names the fetcher returns, ignoring case', async () => {
    const svc = new CommunityBanService(logger, 'hive-109456');
    svc.setFetcher(async () => new Set(['spammer']));
    expect(await svc.refresh()).toEqual(['spammer']);
    expect(svc.isBanned('spammer')).toBe(true);
    expect(svc.isBanned('Spammer')).toBe(true);
    expect(svc.isBanned('alice')).toBe(false);
    expect(svc.isBanned(undefined)).toBe(false);
  });

  it('reports only names added since the last load, and unbans removed ones', async () => {
    const svc = new CommunityBanService(logger, 'hive-109456');
    svc.setFetcher(async () => new Set(['a', 'b']));
    await svc.refresh();
    svc.setFetcher(async () => new Set(['b', 'c']));
    expect(await svc.refresh()).toEqual(['c']);
    expect(svc.isBanned('a')).toBe(false);
    expect(svc.getBanned()).toEqual(['b', 'c']);
  });

  it('keeps the old list when Hive fails, so an outage unbans nobody', async () => {
    const svc = new CommunityBanService(logger, 'hive-109456');
    svc.setFetcher(async () => new Set(['spammer']));
    await svc.refresh();
    svc.setFetcher(async () => { throw new Error('node down'); });
    expect(await svc.refresh()).toEqual([]);
    expect(svc.isBanned('spammer')).toBe(true);
  });

  it('reads muted roles from bridge.list_community_roles, page by page', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => [`user${i}`, i % 10 === 0 ? 'muted' : 'member', '']);
    const page2 = [['last-one', 'muted', ''], ['mod1', 'mod', '']];
    const bodies: any[] = [];
    const realFetch = global.fetch;
    global.fetch = jest.fn(async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      bodies.push(body);
      return { json: async () => ({ result: body.params.last ? page2 : page1 }) } as any;
    }) as any;
    try {
      const svc = new CommunityBanService(logger, 'hive-109456');
      await svc.refresh();
      expect(bodies[0]).toMatchObject({ method: 'bridge.list_community_roles', params: { community: 'hive-109456', limit: 100 } });
      expect(bodies[1].params.last).toBe('user99');
      expect(svc.getBanned()).toHaveLength(11);
      expect(svc.isBanned('last-one')).toBe(true);
      expect(svc.isBanned('mod1')).toBe(false);
    } finally {
      global.fetch = realFetch;
    }
  });
});

describe('Community bans on the socket server', () => {
  const PORT = 4031;
  const sockets: Socket[] = [];
  const connect = (username: string) => {
    const s = ioClient(`http://localhost:${PORT}`, { reconnection: false, forceNew: true, query: { username } });
    sockets.push(s);
    return s;
  };

  beforeAll((done) => {
    authService.setMode('off');
    server.listen(PORT, done);
  });

  afterEach(async () => {
    sockets.splice(0).forEach((s) => s.disconnect());
    communityBans.setFetcher(async () => new Set());
    await communityBans.refresh();
  });

  afterAll((done) => {
    cleanup();
    server.close(done);
  });

  it('refuses a banned player before the socket is accepted', async () => {
    communityBans.setFetcher(async () => new Set(['spammer']));
    await communityBans.refresh();
    const err = await new Promise<Error>((resolve) => connect('spammer').once('connect_error', resolve));
    expect(err.message).toBe('auth_failed: banned');
  });

  it('lets everyone else in', async () => {
    communityBans.setFetcher(async () => new Set(['spammer']));
    await communityBans.refresh();
    const s = connect('alice');
    await new Promise<void>((resolve) => s.once('connect', () => resolve()));
    expect(s.connected).toBe(true);
  });

  it('tells a connected player they were banned and disconnects them', async () => {
    const s = connect('latecomer');
    await new Promise<void>((resolve) => s.once('connect', () => resolve()));
    const told = new Promise((resolve) => s.once('chatBanned', resolve));
    const gone = new Promise<string>((resolve) => s.once('disconnect', resolve));
    kickBanned(['latecomer']);
    await expect(told).resolves.toEqual({ reason: 'community' });
    await expect(gone).resolves.toBe('io server disconnect');
  });
});
