import { Logger } from '../types';

/**
 * Room owners moderate their own rooms (from LambdaMOO's @eject).
 *
 * A room's channel id is `author/permlink`, so the author is the part before
 * the slash. The author can remove a player from that room; the player is
 * sent back to the start room and kept out of that room's chat for a while.
 * Everything here is in memory, like the rest of the chat server's state.
 */

export interface EjectRequest {
  requester: string;
  requesterIsGuest: boolean;
  requesterVerified: boolean;
  target: string;
  channelId: string;
  playersInRoom: string[];
}

export type EjectDecision =
  | { ok: true; target: string; channelId: string; until: number }
  | { ok: false; reason: string };

export interface EjectionRecord {
  at: number;
  by: string;
  target: string;
  channelId: string;
  until: number;
}

export const channelAuthor = (channelId: string): string | null => {
  const slash = channelId.indexOf('/');
  return slash > 0 ? channelId.slice(0, slash) : null;
};

class RoomModerationService {
  private readonly ejectedUntil = new Map<string, number>(); // `${channelId}|${target}` -> until
  private readonly history: EjectionRecord[] = [];
  private readonly maxHistory = 200;

  constructor(
    private logger: Logger,
    private readonly ejectDurationMs: number = 10 * 60 * 1000,
    private readonly now: () => number = Date.now
  ) {}

  private key(channelId: string, target: string): string {
    return `${channelId}|${target.toLowerCase()}`;
  }

  decide(request: EjectRequest): EjectDecision {
    const { requester, target, channelId } = request;
    if (request.requesterIsGuest || !request.requesterVerified) {
      return { ok: false, reason: 'Only signed-in Hive players can remove people from their rooms.' };
    }
    if (channelAuthor(channelId) !== requester) {
      return { ok: false, reason: 'You can only remove people from rooms you built.' };
    }
    const match = request.playersInRoom.find(p => p.toLowerCase() === target.toLowerCase());
    if (!match) {
      return { ok: false, reason: `${target} isn't in this room.` };
    }
    if (match === requester) {
      return { ok: false, reason: "You can't remove yourself." };
    }
    const until = this.now() + this.ejectDurationMs;
    this.ejectedUntil.set(this.key(channelId, match), until);
    this.history.push({ at: this.now(), by: requester, target: match, channelId, until });
    if (this.history.length > this.maxHistory) this.history.shift();
    this.logger.info(`[Moderation] ${requester} removed ${match} from ${channelId} until ${new Date(until).toISOString()}`);
    return { ok: true, target: match, channelId, until };
  }

  /** Is this player still kept out of this room? Returns when they can return. */
  blockedUntil(channelId: string, username: string): number | null {
    const key = this.key(channelId, username);
    const until = this.ejectedUntil.get(key);
    if (!until) return null;
    if (until <= this.now()) {
      this.ejectedUntil.delete(key);
      return null;
    }
    return until;
  }

  recentHistory(): EjectionRecord[] {
    return [...this.history];
  }

  cleanup(): void {
    this.ejectedUntil.clear();
    this.history.length = 0;
  }
}

export default RoomModerationService;
