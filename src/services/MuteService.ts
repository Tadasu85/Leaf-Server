import { Logger } from '../types';

class MuteService {
  private cache: Map<string, { mutedUsers: Set<string>; fetchedAt: number }> = new Map();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes
  private readonly hiveNode: string;
  private logger: Logger;

  constructor(logger: Logger, hiveNode?: string) {
    this.logger = logger;
    this.hiveNode = hiveNode || 'https://api.hive.blog';
  }

  async getMutedUsers(username: string): Promise<Set<string>> {
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
    this.cache.clear();
  }
}

export default MuteService;
