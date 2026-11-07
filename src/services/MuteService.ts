import { Logger } from '../types';
import { isValidHiveUsername } from './AuthService';

class MuteService {
  private cache: Map<string, { mutedUsers: Set<string>; fetchedAt: number }> = new Map();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes
  private readonly hiveNode: string;
  private logger: Logger;
  private refreshTimers: Set<NodeJS.Timeout> = new Set();
  // After a player changes their mute list, Hive's API can take a little while
  // to show it, so the list is reloaded now and again shortly after.
  private readonly refreshDelaysMs = [15 * 1000, 60 * 1000];

  constructor(logger: Logger, hiveNode?: string) {
    this.logger = logger;
    this.hiveNode = hiveNode || 'https://api.hive.blog';
  }

  async getMutedUsers(username: string): Promise<Set<string>> {
    // Guests (and anything else that isn't a Hive account) have no mute list on chain.
    if (!isValidHiveUsername(username)) return new Set();
    const cached = this.cache.get(username);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) {
      return cached.mutedUsers;
    }
    try {
      const mutedUsers = await this.fetchMutedUsers(username);
      this.cache.set(username, { mutedUsers, fetchedAt: Date.now() });
      return mutedUsers;
    } catch (err) {
      this.logger.warn(`[MuteService] Failed to fetch mute list for ${username}: ${err}`);
      return this.cache.get(username)?.mutedUsers ?? new Set();
    }
  }

  async hasMuted(mutingUser: string, targetUser: string): Promise<boolean> {
    const mutedUsers = await this.getMutedUsers(mutingUser);
    return mutedUsers.has(targetUser);
  }

  /**
   * The player just muted or unmuted someone on Hive: drop the cached list
   * and reload it now and twice more, to catch Hive's indexing delay.
   */
  refresh(username: string): void {
    if (!isValidHiveUsername(username)) return;
    const reload = () => {
      // Mark stale rather than delete, so a failed reload keeps the last good list.
      const cached = this.cache.get(username);
      if (cached) cached.fetchedAt = 0;
      this.prefetch(username);
    };
    reload();
    for (const delay of this.refreshDelaysMs) {
      const timer = setTimeout(() => {
        this.refreshTimers.delete(timer);
        reload();
      }, delay);
      timer.unref?.();
      this.refreshTimers.add(timer);
    }
  }

  prefetch(username: string): void {
    this.getMutedUsers(username).catch(() => {});
  }

  private async fetchMutedUsers(username: string): Promise<Set<string>> {
    const muted = new Set<string>();
    let startFollowee = '';

    for (;;) {
      const response = await fetch(this.hiveNode, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'condenser_api.get_following',
          params: [username, startFollowee, 'ignore', 1000],
          id: 1
        }),
        signal: AbortSignal.timeout(5000)
      });

      const data = await response.json() as { result?: Array<{ following: string }> };
      const results = data.result ?? [];

      for (const item of results) {
        muted.add(item.following);
      }

      if (results.length < 1000) break;
      startFollowee = results[results.length - 1]!.following;
    }

    this.logger.info(`[MuteService] Loaded ${muted.size} muted users for ${username}`);
    return muted;
  }

  cleanup(): void {
    for (const timer of this.refreshTimers) clearTimeout(timer);
    this.refreshTimers.clear();
    this.cache.clear();
  }
}

export default MuteService;
