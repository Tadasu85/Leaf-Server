import { Logger } from '../types';

/**
 * page (to anyone online) and whisper (to someone in the same room), from
 * LambdaMOO. Messages go straight to the recipient's socket: they are never
 * written to Hive and never logged with their text.
 */

export type PrivateKind = 'page' | 'whisper';

export const MAX_PRIVATE_MESSAGE_LENGTH = 500;

export interface PrivateMessageCheck {
  sender: string;
  target: string;
  message: string;
  kind: PrivateKind;
  targetOnline: boolean;
  /** For whispers: are both in the same room? */
  sameRoom: boolean;
}

export type PrivateDecision =
  | { ok: true; message: string }
  | { ok: false; reason: string };

class PrivateMessageService {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private logger: Logger,
    private readonly maxPerMinute: number = 10,
    private readonly now: () => number = Date.now
  ) {}

  check(input: PrivateMessageCheck): PrivateDecision {
    const message = input.message.replace(/\s+/g, ' ').trim();
    if (!input.target || !message) {
      return { ok: false, reason: `Usage: ${input.kind} <player> <message>` };
    }
    if (input.target.toLowerCase() === input.sender.toLowerCase()) {
      return { ok: false, reason: `You can't ${input.kind} yourself.` };
    }
    if (message.length > MAX_PRIVATE_MESSAGE_LENGTH) {
      return { ok: false, reason: `Messages can be at most ${MAX_PRIVATE_MESSAGE_LENGTH} characters.` };
    }
    if (!input.targetOnline) {
      return { ok: false, reason: `${input.target} isn't online.` };
    }
    if (input.kind === 'whisper' && !input.sameRoom) {
      return { ok: false, reason: `${input.target} isn't here. Use page to reach someone in another room.` };
    }
    const now = this.now();
    const window = this.windows.get(input.sender);
    if (!window || now - window.start > 60000) {
      this.windows.set(input.sender, { start: now, count: 1 });
    } else if (++window.count > this.maxPerMinute) {
      return { ok: false, reason: 'You are sending messages too quickly. Please wait a moment.' };
    }
    this.logger.debug(`[PrivateMessage] ${input.kind} from ${input.sender} to ${input.target}`);
    return { ok: true, message };
  }

  forget(username: string): void {
    this.windows.delete(username);
  }

  cleanup(): void {
    this.windows.clear();
  }
}

export default PrivateMessageService;
