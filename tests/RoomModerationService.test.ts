import RoomModerationService, { channelAuthor } from '../src/services/RoomModerationService';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any;

describe('RoomModerationService', () => {
  let now = 1_000_000;
  const service = () => new RoomModerationService(logger, 10 * 60 * 1000, () => now);
  const base = { requester: 'ray', requesterIsGuest: false, requesterVerified: true, target: 'pest', channelId: 'ray/glass-room', playersInRoom: ['ray', 'pest'] };

  beforeEach(() => { now = 1_000_000; });

  it('reads the author from a channel id', () => {
    expect(channelAuthor('ray/glass-room')).toBe('ray');
    expect(channelAuthor('nonsense')).toBeNull();
  });

  it("lets a room's author remove a player and keeps them out for 10 minutes", () => {
    const s = service();
    expect(s.decide(base)).toEqual({ ok: true, target: 'pest', channelId: 'ray/glass-room', until: now + 600000 });
    expect(s.blockedUntil('ray/glass-room', 'PEST')).toBe(now + 600000);
    expect(s.blockedUntil('ray/other-room', 'pest')).toBeNull();
    now += 600001;
    expect(s.blockedUntil('ray/glass-room', 'pest')).toBeNull();
  });

  it('matches the target name case-insensitively', () => {
    expect(service().decide({ ...base, target: 'PEST' })).toMatchObject({ ok: true, target: 'pest' });
  });

  it('refuses anyone who is not the room author', () => {
    expect(service().decide({ ...base, requester: 'pest', target: 'ray' }))
      .toEqual({ ok: false, reason: 'You can only remove people from rooms you built.' });
  });

  it('refuses guests and unverified players', () => {
    expect(service().decide({ ...base, requesterIsGuest: true }).ok).toBe(false);
    expect(service().decide({ ...base, requesterVerified: false }).ok).toBe(false);
  });

  it('refuses players who are not in the room, and the author themselves', () => {
    expect(service().decide({ ...base, target: 'ghost' })).toEqual({ ok: false, reason: "ghost isn't in this room." });
    expect(service().decide({ ...base, target: 'ray' })).toEqual({ ok: false, reason: "You can't remove yourself." });
  });

  it('keeps a history of removals', () => {
    const s = service();
    s.decide(base);
    expect(s.recentHistory()).toEqual([{ at: now, by: 'ray', target: 'pest', channelId: 'ray/glass-room', until: now + 600000 }]);
  });
});
