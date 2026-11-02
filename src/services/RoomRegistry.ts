import { Logger } from '../types';

interface RoomEntry {
  author?: string;
}

/**
 * Keeps a cached copy of the game's room map
 * (game account posting_json_metadata.egodeathgamedata.rooms_authors_exits)
 * so the server can tell real rooms apart from arbitrary Hive posts.
 */
class RoomRegistry {
  private logger: Logger;
  private readonly hiveNode: string;
  private readonly gameAccount: string;
  private readonly cacheTTL: number;
  private readonly missRefreshCooldown = 60 * 1000; // at most one refresh per minute on a cache miss
  private rooms: Map<string, RoomEntry> | null = null;
  private fetchedAt = 0;
  private lastMissRefresh = 0;
  private inflight: Promise<void> | null = null;

  constructor(logger: Logger, gameAccount: string, hiveNode?: string, cacheTTL: number = 5 * 60 * 1000) {
    this.logger = logger;
    this.gameAccount = gameAccount;
    this.hiveNode = hiveNode || 'https://api.hive.blog';
    this.cacheTTL = cacheTTL;
  }

  /** True once the map has been loaded at least once. */
  isLoaded(): boolean {
    return this.rooms !== null;
  }

  /**
   * Synchronous check against the cached map. Returns false for unknown rooms.
   * A miss triggers a throttled background refresh so newly approved rooms
   * are picked up without waiting for the TTL.
   */
  isKnownRoom(author: string, permlink: string): boolean {
    if (this.rooms && this.lookup(author, permlink)) return true;
    if (Date.now() - this.lastMissRefresh > this.missRefreshCooldown) {
      this.lastMissRefresh = Date.now();
      this.refresh().catch(() => undefined);
    }
    return false;
  }

  /** Checks the room after making sure the cache is fresh. Fails closed. */
  async verifyRoom(author: string, permlink: string): Promise<boolean> {
    try {
      await this.ensureFresh();
    } catch {
      return false;
    }
    return this.rooms !== null && this.lookup(author, permlink);
  }

  async ensureFresh(): Promise<void> {
    if (this.rooms && Date.now() - this.fetchedAt < this.cacheTTL) return;
    await this.refresh();
  }

  refresh(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = this.fetchRooms()
      .then(rooms => {
        this.rooms = rooms;
        this.fetchedAt = Date.now();
        this.logger.info(`[RoomRegistry] Loaded ${rooms.size} rooms from @${this.gameAccount}`);
      })
      .catch(err => {
        this.logger.warn(`[RoomRegistry] Failed to load room map: ${err}`);
        throw err;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  /** Test helper / manual override. */
  setRooms(rooms: Record<string, RoomEntry>): void {
    this.rooms = new Map(Object.entries(rooms));
    this.fetchedAt = Date.now();
  }

  // Supports today's permlink-only keys and future `author/permlink` keys.
  private lookup(author: string, permlink: string): boolean {
    const rooms = this.rooms!;
    if (rooms.has(`${author}/${permlink}`)) return true;
    const entry = rooms.get(permlink);
    return !!entry && entry.author === author;
  }

  private async fetchRooms(): Promise<Map<string, RoomEntry>> {
    const response = await fetch(this.hiveNode, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'condenser_api.get_accounts',
        params: [[this.gameAccount]],
        id: 1
      }),
      signal: AbortSignal.timeout(5000)
    });

    const data = await response.json() as { result?: Array<{ posting_json_metadata?: string }> };
    const raw = data.result?.[0]?.posting_json_metadata;
    if (!raw) throw new Error(`No posting_json_metadata for @${this.gameAccount}`);

    const parsed = JSON.parse(raw) as { egodeathgamedata?: { rooms_authors_exits?: Record<string, RoomEntry> } };
    const map = parsed.egodeathgamedata?.rooms_authors_exits;
    if (!map) throw new Error('Game metadata has no rooms_authors_exits');
    return new Map(Object.entries(map));
  }
}

export default RoomRegistry;
