import { Client, PrivateKey } from '@hiveio/dhive';
import { Logger } from '../types';

const EXPLORER_THRESHOLD = parseInt(process.env['BUILDER_EXPLORER_ROOMS'] || '') || 25;
const CHRONICLER_THRESHOLD_SECONDS = (parseInt(process.env['BUILDER_CHRONICLER_HOURS'] || '') || 5) * 3600;
const MAX_DWELL_SECONDS = 3600;

interface MoveOp {
  timestamp: string;
  author: string;
  permlink: string;
}

export interface BuilderProgress {
  uniqueRooms: number;
  totalSeconds: number;
  explorerMet: boolean;
  chroniclerMet: boolean;
}

class BuilderService {
  private logger: Logger;
  private client: Client;
  private postingKey: string | null;
  private gameAccount: string;
  private gameIdName: string;

  constructor(logger: Logger, gameAccount: string, gameIdName: string, postingKey: string | null) {
    this.logger = logger;
    this.gameAccount = gameAccount;
    this.gameIdName = gameIdName;
    this.postingKey = postingKey;
    this.client = new Client(['https://api.hive.blog']);

    if (!postingKey) {
      this.logger.warn('[BuilderService] No HIVE_POSTING_KEY configured - builder promotion disabled');
    }
  }

  async getProgress(username: string): Promise<BuilderProgress> {
    const moves = await this.fetchMoveOps(username);
    return this.calculateProgress(moves);
  }

  async verifyAndPromote(username: string): Promise<{ granted: boolean; reason?: string }> {
    try {
      const community = await (this.client as any).hivemind.getCommunity({ name: this.gameAccount });
      const team: any[][] = community?.team || [];
      if (team.some(m => m[0] === username && m[2] === 'Builder')) {
        this.logger.info(`[BuilderService] ${username} is already a Builder`);
        return { granted: true };
      }
    } catch { /* community check failed, proceed to verify */ }

    const moves = await this.fetchMoveOps(username);
    const progress = this.calculateProgress(moves);

    if (!progress.explorerMet) {
      return { granted: false, reason: `Explorer: ${progress.uniqueRooms}/${EXPLORER_THRESHOLD} rooms` };
    }
    if (!progress.chroniclerMet) {
      const hours = (progress.totalSeconds / 3600).toFixed(1);
      return { granted: false, reason: `Chronicler: ${hours}/${CHRONICLER_THRESHOLD_SECONDS / 3600} hours` };
    }
    if (!this.postingKey) {
      return { granted: false, reason: 'Promotion not configured on server' };
    }

    try {
      const key = PrivateKey.fromString(this.postingKey);
      await this.client.broadcast.sendOperations([
        ['custom_json', {
          required_auths: [],
          required_posting_auths: [this.gameAccount],
          id: 'community',
          json: JSON.stringify(['setUserTitle', {
            community: this.gameAccount,
            account: username,
            title: 'Builder'
          }])
        }]
      ], key);

      this.logger.info(`[BuilderService] Promoted ${username} to Builder`);
      return { granted: true };
    } catch (error) {
      this.logger.error(`[BuilderService] Failed to promote ${username}:`, error);
      return { granted: false, reason: 'Blockchain promotion failed' };
    }
  }

  private async fetchMoveOps(username: string): Promise<MoveOp[]> {
    const moves: MoveOp[] = [];
    let from = -1;
    const limit = 1000;
    const maxPages = 5;

    for (let page = 0; page < maxPages; page++) {
      const history = (await this.client.database.getAccountHistory(username, from, limit)) as [number, any][];
      if (!history || !history.length) break;

      for (const [, op] of history) {
        if (op.op[0] === 'custom_json' && op.op[1]['id'] === this.gameIdName) {
          try {
            const json = JSON.parse(op.op[1]['json']);
            if (json.move_to?.Location) {
              moves.push({
                timestamp: op.timestamp,
                author: json.move_to.Location.author,
                permlink: json.move_to.Location.permlink
              });
            }
          } catch { /* malformed op, skip */ }
        }
      }

      if (history.length < limit) break;
      const earliest = history[0];
      if (!earliest || earliest[0] === 0) break;
      from = earliest[0] - 1;
    }

    return moves.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  private calculateProgress(moves: MoveOp[]): BuilderProgress {
    const uniqueRooms = new Set(moves.map(m => `${m.author}/${m.permlink}`)).size;

    let totalSeconds = 0;
    for (let i = 0; i < moves.length - 1; i++) {
      const curr = moves[i]!;
      const next = moves[i + 1]!;
      const dwell = (Date.parse(next.timestamp) - Date.parse(curr.timestamp)) / 1000;
      totalSeconds += Math.min(dwell, MAX_DWELL_SECONDS);
    }

    return {
      uniqueRooms,
      totalSeconds,
      explorerMet: uniqueRooms >= EXPLORER_THRESHOLD,
      chroniclerMet: totalSeconds >= CHRONICLER_THRESHOLD_SECONDS
    };
  }
}

export default BuilderService;
