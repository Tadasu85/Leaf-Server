import RoomRegistry from '../src/services/RoomRegistry';
import CurationService from '../src/services/CurationService';
import Logger from '../src/utils/Logger';
import { getClientIP } from '../src/utils/clientIP';

describe('RoomRegistry', () => {
  const logger = new Logger();

  it('matches permlink-keyed rooms only for the right author', () => {
    const registry = new RoomRegistry(logger, 'hive-109456');
    registry.setRooms({ 'deep-cavern': { author: 'raymonjohnstone' } });
    expect(registry.isKnownRoom('raymonjohnstone', 'deep-cavern')).toBe(true);
    expect(registry.isKnownRoom('someoneelse', 'deep-cavern')).toBe(false);
    expect(registry.isKnownRoom('raymonjohnstone', 'not-a-room')).toBe(false);
  });

  it('matches author/permlink keys', () => {
    const registry = new RoomRegistry(logger, 'hive-109456');
    registry.setRooms({ 'alice/the-dock': { author: 'alice' } });
    expect(registry.isKnownRoom('alice', 'the-dock')).toBe(true);
  });

  it('verifyRoom fails closed when the map cannot load', async () => {
    const registry = new RoomRegistry(logger, 'hive-109456', 'http://127.0.0.1:1');
    const spy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(registry.verifyRoom('raymonjohnstone', 'deep-cavern')).resolves.toBe(false);
    spy.mockRestore();
  });
});

describe('CurationService room validation', () => {
  const logger = new Logger();

  it('ignores visits to rooms not in the map once it is loaded', () => {
    const registry = new RoomRegistry(logger, 'hive-109456');
    registry.setRooms({ 'deep-cavern': { author: 'raymonjohnstone' } });
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    const curation = new CurationService(logger, 'hive-109456', null, registry);

    curation.recordVisit('raymonjohnstone/deep-cavern', 'alice');
    curation.recordVisit('somebody/random-post', 'alice');

    expect(curation.getDryRun().map(r => r.channelId)).toEqual(['raymonjohnstone/deep-cavern']);
    curation.cleanup();
    fetchSpy.mockRestore();
  });

  it('parses channel ids', () => {
    expect(CurationService.parseChannelId('a/b')).toEqual({ author: 'a', permlink: 'b' });
    expect(CurationService.parseChannelId('nopermlink')).toBeNull();
    expect(CurationService.parseChannelId('/b')).toBeNull();
    expect(CurationService.parseChannelId('a/')).toBeNull();
  });
});

describe('getClientIP', () => {
  it('uses the rightmost X-Forwarded-For entry', () => {
    expect(getClientIP('1.1.1.1, 2.2.2.2', '10.0.0.1')).toBe('2.2.2.2');
    expect(getClientIP('3.3.3.3', '10.0.0.1')).toBe('3.3.3.3');
  });
  it('falls back to the socket address', () => {
    expect(getClientIP(undefined, '10.0.0.1')).toBe('10.0.0.1');
    expect(getClientIP('', '10.0.0.1')).toBe('10.0.0.1');
  });
});
