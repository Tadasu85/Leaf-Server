import { Logger } from '../types';
import { ChainOp, MoveSource } from './MoveSource';

export interface RoomCount {
  channelId: string;
  author: string;
  permlink: string;
  uniqueVisitors: number;
}

export interface ChainVisitStats {
  source: string;
  /** False until the first full window has been read. */
  ready: boolean;
  windowHours: number;
  firstBlock: number | null;
  lastBlock: number | null;
  blocksRead: number;
  mbDownloaded: number;
  backfillSeconds: number | null;
  movesCounted: number;
  movesSkipped: number;
  lastError: string | null;
}

interface Options {
  gameId: string;
  /** Visits older than this, by block time, stop counting. */
  windowMs?: number;
  pollMs?: number;
  /** Hive makes a block every 3 s. */
  blockMs?: number;
  /** Rooms not on the map don't count (checked when counts are read). */
  isKnownRoom?: (author: string, permlink: string) => boolean;
  /** When false (map not loaded yet), every room is listed; votes re-check. */
  isMapLoaded?: () => boolean;
}

/**
 * Counts unique visitors per room from players' `move_to` ops on Hive, over a
 * rolling window (24 hours by default). The chain is the record: a restart,
 * or Render waking from sleep, re-reads the window instead of losing counts,
 * and moves made without a chat connection count too.
 *
 * Rules: one visit per player per room in the window; a room's author never
 * counts for their own room; rooms must be on the game map. Guests can't
 * write to Hive, so they never appear.
 */
class ChainVisitService {
  private visits: Map<string, Map<string, number>> = new Map();
  private nextBlock: number | null = null;
  private latestTime = 0;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly windowMs: number;
  private readonly pollMs: number;
  private readonly blockMs: number;
  private backfillStartedAt: number | null = null;
  private stats: ChainVisitStats;

  constructor(private logger: Logger, private source: MoveSource, private opts: Options) {
    this.windowMs = opts.windowMs ?? 24 * 60 * 60 * 1000;
    this.pollMs = opts.pollMs ?? 60 * 1000;
    this.blockMs = opts.blockMs ?? 3000;
    this.stats = {
      source: source.name,
      ready: false,
      windowHours: this.windowMs / 3600000,
      firstBlock: null,
      lastBlock: null,
      blocksRead: 0,
      mbDownloaded: 0,
      backfillSeconds: null,
      movesCounted: 0,
      movesSkipped: 0,
      lastError: null,
    };
  }

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.pollMs);
    this.timer.unref?.();
  }

  cleanup(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  isReady(): boolean {
    return this.stats.ready;
  }

  getStats(): ChainVisitStats {
    return { ...this.stats, mbDownloaded: Math.round(this.stats.mbDownloaded * 10) / 10 };
  }

  /** Read from where we left off up to the last irreversible block. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const head = await this.source.headBlock();
      const windowBlocks = Math.ceil(this.windowMs / this.blockMs);
      // First run, or asleep longer than the window: start one window back.
      if (this.nextBlock === null || head - this.nextBlock >= windowBlocks) {
        this.nextBlock = Math.max(1, head - windowBlocks + 1);
        this.stats.firstBlock = this.nextBlock;
        this.stats.ready = false;
        this.backfillStartedAt = Date.now();
        this.logger.info(`[ChainVisits] Reading ${head - this.nextBlock + 1} blocks (${this.stats.windowHours} h) from ${this.source.name}`);
      }
      while (this.nextBlock <= head) {
        // Chunks keep progress (and the counts) moving during a long backfill.
        const to = Math.min(head, this.nextBlock + 999);
        const res = await this.source.read(this.nextBlock, to, this.opts.gameId);
        const last = res.lastBlock ?? to;
        res.ops.forEach((op) => this.apply(op));
        this.stats.blocksRead += last - this.nextBlock + 1;
        this.stats.mbDownloaded += res.bytes / 1e6;
        this.stats.lastBlock = last;
        this.nextBlock = last + 1;
      }
      this.prune();
      this.stats.lastError = null;
      if (!this.stats.ready) {
        this.stats.ready = true;
        this.stats.backfillSeconds = this.backfillStartedAt ? Math.round((Date.now() - this.backfillStartedAt) / 1000) : null;
        this.logger.info(
          `[ChainVisits] Ready: ${this.stats.blocksRead} blocks, ${this.getStats().mbDownloaded} MB, ` +
          `${this.stats.backfillSeconds} s, ${this.stats.movesCounted} visits counted`,
        );
      }
    } catch (err) {
      // Keep what we have; the next tick resumes from nextBlock.
      this.stats.lastError = String(err);
      this.logger.warn(`[ChainVisits] Read failed, will retry: ${err}`);
    } finally {
      this.running = false;
    }
  }

  /** Apply one op. Exposed for tests. */
  apply(op: ChainOp): void {
    if (op.id !== this.opts.gameId) return;
    let author: unknown;
    let permlink: unknown;
    try {
      const loc = JSON.parse(op.json)?.move_to?.Location;
      author = loc?.author;
      permlink = loc?.permlink;
    } catch {
      /* malformed */
    }
    if (typeof author !== 'string' || typeof permlink !== 'string' || !author || !permlink) {
      this.stats.movesSkipped++;
      return;
    }
    const player = op.account.toLowerCase();
    if (player === author.toLowerCase()) {
      this.stats.movesSkipped++; // authors don't count for their own rooms
      return;
    }
    const channelId = `${author}/${permlink}`;
    let room = this.visits.get(channelId);
    if (!room) {
      room = new Map();
      this.visits.set(channelId, room);
    }
    if (!room.has(player)) this.stats.movesCounted++;
    room.set(player, Math.max(room.get(player) ?? 0, op.time));
    this.latestTime = Math.max(this.latestTime, op.time);
  }

  /** Drop visits older than the window, measured from the newest block seen. */
  private prune(): void {
    const cutoff = this.latestTime - this.windowMs;
    for (const [channelId, room] of this.visits) {
      for (const [player, time] of room) {
        if (time <= cutoff) room.delete(player);
      }
      if (room.size === 0) this.visits.delete(channelId);
    }
  }

  getCounts(): RoomCount[] {
    this.prune();
    const mapLoaded = this.opts.isMapLoaded?.() ?? false;
    const out: RoomCount[] = [];
    for (const [channelId, room] of this.visits) {
      const slash = channelId.indexOf('/');
      const author = channelId.slice(0, slash);
      const permlink = channelId.slice(slash + 1);
      if (mapLoaded && this.opts.isKnownRoom && !this.opts.isKnownRoom(author, permlink)) continue;
      out.push({ channelId, author, permlink, uniqueVisitors: room.size });
    }
    return out.sort((a, b) => b.uniqueVisitors - a.uniqueVisitors || a.channelId.localeCompare(b.channelId));
  }
}

export default ChainVisitService;
