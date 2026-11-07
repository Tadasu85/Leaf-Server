import MuteService from '../src/services/MuteService';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any;

const hiveResponse = (names: string[]) => ({
  json: async () => ({ result: names.map((following) => ({ follower: 'alice', following, what: ['ignore'] })) })
});

describe('MuteService', () => {
  let fetchMock: jest.Mock;
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn().mockResolvedValue(hiveResponse(['spammer']));
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    jest.useRealTimers();
    (global as any).fetch = realFetch;
  });

  it("respects a player's Hive mute list", async () => {
    const service = new MuteService(logger, 'https://hive.test');
    await expect(service.hasMuted('alice', 'spammer')).resolves.toBe(true);
    await expect(service.hasMuted('alice', 'friend')).resolves.toBe(false);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.method).toBe('condenser_api.get_following');
    expect(body.params).toEqual(['alice', '', 'ignore', 1000]);
    service.cleanup();
  });

  it('caches the list between lookups', async () => {
    const service = new MuteService(logger, 'https://hive.test');
    await service.getMutedUsers('alice');
    await service.getMutedUsers('alice');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    service.cleanup();
  });

  it('never asks Hive about guests', async () => {
    const service = new MuteService(logger, 'https://hive.test');
    await expect(service.getMutedUsers('Guest-123456')).resolves.toEqual(new Set());
    await expect(service.hasMuted('Guest-123456', 'alice')).resolves.toBe(false);
    service.refresh('Guest-123456');
    expect(fetchMock).not.toHaveBeenCalled();
    service.cleanup();
  });

  it('reloads the list on refresh, and again after Hive has had time to index', async () => {
    const service = new MuteService(logger, 'https://hive.test');
    await service.getMutedUsers('alice');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(hiveResponse(['spammer', 'newpest']));
    service.refresh('alice');
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(15 * 1000);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    jest.advanceTimersByTime(45 * 1000);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await expect(service.hasMuted('alice', 'newpest')).resolves.toBe(true);
    service.cleanup();
  });

  it('keeps the last good list if Hive is unreachable', async () => {
    const service = new MuteService(logger, 'https://hive.test');
    await service.getMutedUsers('alice');
    fetchMock.mockRejectedValue(new Error('timeout'));
    service.refresh('alice');
    await Promise.resolve();
    await expect(service.hasMuted('alice', 'spammer')).resolves.toBe(true);
    service.cleanup();
  });
});
