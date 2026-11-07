import PrivateMessageService, { MAX_PRIVATE_MESSAGE_LENGTH } from '../src/services/PrivateMessageService';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any;
const base = { sender: 'alice', target: 'bob', message: '  hello   there ', kind: 'page' as const, targetOnline: true, sameRoom: false };

describe('PrivateMessageService', () => {
  it('accepts a page and tidies the text', () => {
    expect(new PrivateMessageService(logger).check(base)).toEqual({ ok: true, message: 'hello there' });
  });

  it('needs a target and a message', () => {
    const s = new PrivateMessageService(logger);
    expect(s.check({ ...base, message: '  ' })).toEqual({ ok: false, reason: 'Usage: page <player> <message>' });
    expect(s.check({ ...base, target: '' }).ok).toBe(false);
  });

  it('refuses yourself, long messages and offline players', () => {
    const s = new PrivateMessageService(logger);
    expect(s.check({ ...base, target: 'ALICE' })).toEqual({ ok: false, reason: "You can't page yourself." });
    expect(s.check({ ...base, message: 'x'.repeat(MAX_PRIVATE_MESSAGE_LENGTH + 1) }).ok).toBe(false);
    expect(s.check({ ...base, targetOnline: false })).toEqual({ ok: false, reason: "bob isn't online." });
  });

  it('only whispers within the same room', () => {
    const s = new PrivateMessageService(logger);
    expect(s.check({ ...base, kind: 'whisper' })).toEqual({ ok: false, reason: "bob isn't here. Use page to reach someone in another room." });
    expect(s.check({ ...base, kind: 'whisper', sameRoom: true }).ok).toBe(true);
  });

  it('limits each sender to 10 a minute', () => {
    let now = 0;
    const s = new PrivateMessageService(logger, 10, () => now);
    for (let i = 0; i < 10; i++) expect(s.check(base).ok).toBe(true);
    expect(s.check(base)).toEqual({ ok: false, reason: 'You are sending messages too quickly. Please wait a moment.' });
    now = 61000;
    expect(s.check(base).ok).toBe(true);
  });
});
