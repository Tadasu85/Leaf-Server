import { Logger } from '../types';

type Fetcher = (community: string) => Promise<Set<string>>;

/**
 * Players with the "muted" role in the game's Hive community are banned from
 * chat everywhere in the game (decided Nov 8). The community's role list on
 * Hive is the source of truth; this keeps a copy and reloads it on a timer.
 * Guests can't hold community roles, so they're never on the list.
 */
class CommunityBanService {
  private banned: Set<string> = new Set();
  private loaded = false;
  private timer: NodeJS.Timeout | null = null;
  private fetcher: Fetcher;

  constructor(
    private logger: Logger,
    private community: string,
    private hiveNode: string = 'https://api.hive.blog',
    private refreshMs: number = 10 * 60 * 1000,
  ) {
    this.fetcher = (c) => this.fetchMuted(c);
  }

  /** For tests: replace the Hive lookup. */
  setFetcher(fetcher: Fetcher): void {
    this.fetcher = fetcher;
  }

  isBanned(username: string | undefined | null): boolean {
    return Boolean(username) && this.banned.has(String(username).toLowerCase());
  }

  getBanned(): string[] {
    return [...this.banned].sort();
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Reload the list. On failure the previous list is kept, so a Hive node
   * outage never unbans anyone. Returns the names newly added this time.
   */
  async refresh(): Promise<string[]> {
    try {
      const next = await this.fetcher(this.community);
      const added = [...next].filter((n) => !this.banned.has(n));
      const removed = [...this.banned].filter((n) => !next.has(n));
      this.banned = next;
      this.loaded = true;
      if (added.length || removed.length) {
        this.logger.info(
          `[CommunityBan] ${this.community}: ${next.size} muted` +
          (added.length ? `; added ${added.join(', ')}` : '') +
          (removed.length ? `; removed ${removed.join(', ')}` : ''),
        );
      }
      return added;
    } catch (err) {
      this.logger.warn(`[CommunityBan] Failed to load roles for ${this.community}: ${err}`);
      return [];
    }
  }

  /** Load now and then on a timer. onAdded runs with names newly banned. */
  start(onAdded?: (names: string[]) => void): void {
    const run = () => this.refresh().then((added) => {
      if (added.length && onAdded) onAdded(added);
    });
    void run();
    this.timer = setInterval(run, this.refreshMs);
    this.timer.unref?.();
  }

  cleanup(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async fetchMuted(community: string): Promise<Set<string>> {
    const muted = new Set<string>();
    let last: string | undefined;
    for (let page = 0; page < 100; page++) {
      const params: Record<string, unknown> = { community, limit: 100 };
      if (last) params['last'] = last;
      const response = await fetch(this.hiveNode, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'bridge.list_community_roles', params, id: 1 }),
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json() as { result?: Array<[string, string, string?]>; error?: unknown };
      if (!data.result) throw new Error(`no result: ${JSON.stringify(data.error ?? data)}`);
      for (const [account, role] of data.result) {
        if (role === 'muted') muted.add(account.toLowerCase());
      }
      if (data.result.length < 100) break;
      last = data.result[data.result.length - 1]![0];
    }
    return muted;
  }
}

export default CommunityBanService;
