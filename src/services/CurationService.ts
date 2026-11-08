import { Client, PrivateKey } from '@hiveio/dhive';
import { Logger } from '../types';
import RoomRegistry from './RoomRegistry';

interface RoomScore {
  uniqueVisitors: Set<string>;
}

/** Counts from the chain (ChainVisitService). When set, chat-join visits are ignored. */
export interface VisitSource {
  isReady(): boolean;
  getCounts(): { channelId: string; author: string; permlink: string; uniqueVisitors: number }[];
}

class CurationService {
  private logger: Logger;
  private client: Client;
  private postingKey: string | null;
  private gameAccount: string;
  private scores: Map<string, RoomScore> = new Map();
  private votingInterval: NodeJS.Timeout | null = null;
  private readonly INTERVAL_MS: number;
  private readonly TOP_N: number;
  private readonly VOTE_WEIGHT: number;
  private roomRegistry: RoomRegistry | null;
  private visitSource: VisitSource | null = null;

  constructor(logger: Logger, gameAccount: string, postingKey: string | null, roomRegistry: RoomRegistry | null = null) {
    this.logger = logger;
    this.roomRegistry = roomRegistry;
    this.gameAccount = gameAccount;
    this.postingKey = postingKey;
    this.client = new Client(['https://api.hive.blog']);
    this.INTERVAL_MS = parseInt(process.env['CURATION_INTERVAL_MS'] || '') || 24 * 60 * 60 * 1000;
    this.TOP_N = parseInt(process.env['CURATION_TOP_N'] || '') || 3;
    this.VOTE_WEIGHT = parseInt(process.env['CURATION_VOTE_WEIGHT'] || '') || 3000;

    if (!postingKey) {
      this.logger.warn('[CurationService] No HIVE_POSTING_KEY configured - curation votes disabled');
    }

    if (process.env['NODE_ENV'] !== 'test') {
      this.votingInterval = setInterval(() => this.runCuration(), this.INTERVAL_MS);
      this.logger.info(`[CurationService] Curation interval: ${this.INTERVAL_MS}ms, top ${this.TOP_N} rooms at ${this.VOTE_WEIGHT / 100}% weight`);
    }
  }

  getTopN(): number {
    return this.TOP_N;
  }

  /** Count visits from the chain instead of chat joins. */
  setVisitSource(source: VisitSource): void {
    this.visitSource = source;
    this.scores.clear();
  }

  getDryRun(): { channelId: string; author: string; permlink: string; uniqueVisitors: number }[] {
    if (this.visitSource) {
      return this.visitSource.getCounts().filter(r => r.uniqueVisitors > 0);
    }
    return Array.from(this.scores.entries())
      .map(([channelId, room]) => {
        const slashIndex = channelId.indexOf('/');
        return {
          channelId,
          author: slashIndex !== -1 ? channelId.slice(0, slashIndex) : channelId,
          permlink: slashIndex !== -1 ? channelId.slice(slashIndex + 1) : '',
          uniqueVisitors: room.uniqueVisitors.size
        };
      })
      .filter(r => r.uniqueVisitors > 0)
      .sort((a, b) => b.uniqueVisitors - a.uniqueVisitors);
  }

  recordVisit(channelId: string, username: string): void {
    if (this.visitSource) return; // the chain is the record
    // Only count rooms that are in the game's map. Until the map has loaded
    // once, visits are recorded and filtered again at vote time.
    if (this.roomRegistry?.isLoaded()) {
      const parsed = CurationService.parseChannelId(channelId);
      if (!parsed || !this.roomRegistry.isKnownRoom(parsed.author, parsed.permlink)) {
        this.logger.debug(`[CurationService] Ignoring visit to unknown room ${channelId}`);
        return;
      }
    }
    if (!this.scores.has(channelId)) {
      this.scores.set(channelId, { uniqueVisitors: new Set() });
    }
    this.scores.get(channelId)!.uniqueVisitors.add(username);
  }

  private async runCuration(): Promise<void> {
    if (!this.postingKey) return;
    if (this.visitSource) {
      // A rolling window: nothing to clear after voting.
      if (!this.visitSource.isReady()) {
        this.logger.warn('[CurationService] Chain visits still loading; skipping this round');
        return;
      }
      const ranked = this.visitSource.getCounts().slice(0, this.TOP_N);
      this.logger.info(`[CurationService] Running curation on ${ranked.length} top rooms (chain visits)`);
      for (const { channelId, uniqueVisitors } of ranked) {
        await this.voteRoom(channelId, uniqueVisitors);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      return;
    }
    if (this.scores.size === 0) return;

    const ranked = Array.from(this.scores.entries())
      .map(([channelId, room]) => ({ channelId, score: room.uniqueVisitors.size }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.TOP_N);

    this.logger.info(`[CurationService] Running curation on ${ranked.length} top rooms`);
    this.scores.clear();

    for (const { channelId, score } of ranked) {
      await this.voteRoom(channelId, score);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  static parseChannelId(channelId: string): { author: string; permlink: string } | null {
    const slashIndex = channelId.indexOf('/');
    if (slashIndex <= 0 || slashIndex === channelId.length - 1) return null;
    return { author: channelId.slice(0, slashIndex), permlink: channelId.slice(slashIndex + 1) };
  }

  private async voteRoom(channelId: string, score: number): Promise<void> {
    const parsed = CurationService.parseChannelId(channelId);
    if (!parsed) {
      this.logger.warn(`[CurationService] Invalid channelId format: ${channelId}`);
      return;
    }
    const { author, permlink } = parsed;

    // Never vote on a post that isn't a room in the game's map (fails closed
    // if the map can't be loaded).
    if (!this.roomRegistry || !(await this.roomRegistry.verifyRoom(author, permlink))) {
      this.logger.warn(`[CurationService] Skipping vote on ${channelId}: not a known room`);
      return;
    }

    try {
      const key = PrivateKey.fromString(this.postingKey!);
      await this.client.broadcast.vote({ voter: this.gameAccount, author, permlink, weight: this.VOTE_WEIGHT }, key);
      this.logger.info(`[CurationService] Voted on ${channelId} (${score} unique visitors)`);
    } catch (error) {
      this.logger.error(`[CurationService] Failed to vote on ${channelId}:`, error);
    }
  }

  cleanup(): void {
    if (this.votingInterval) {
      clearInterval(this.votingInterval);
      this.votingInterval = null;
    }
    this.scores.clear();
  }
}

export default CurationService;
