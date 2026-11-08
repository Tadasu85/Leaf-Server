import { Logger } from '../types';

/** One custom_json op from the chain, before any game rules are applied. */
export interface ChainOp {
  block: number;
  /** Block time in ms since epoch. */
  time: number;
  /** required_posting_auths[0], the account that signed it. */
  account: string;
  id: string;
  json: string;
}

export interface ReadResult {
  ops: ChainOp[];
  /** Response bytes downloaded, for the cost numbers in /curation/dryrun. */
  bytes: number;
  /** Last block actually read, when a source stops short of `to`. */
  lastBlock?: number;
}

/**
 * Where moves come from. ChainVisitService only depends on this, so a
 * filtered source (for example a HAF endpoint that returns only our
 * custom_json id) can replace whole-block reading without touching counting.
 */
export interface MoveSource {
  readonly name: string;
  /** Last irreversible block: moves before it can never be undone by a fork. */
  headBlock(): Promise<number>;
  /** custom_json ops with the given id in blocks [from, to], inclusive. */
  read(from: number, to: number, id: string): Promise<ReadResult>;
}

type Fetch = typeof fetch;

/**
 * Reads whole blocks with block_api.get_block_range and keeps only custom_json
 * ops with our id. Works on any public Hive API node. Its cost follows Hive's
 * overall activity, not the game's: every block is downloaded either way.
 */
export class BlockRangeMoveSource implements MoveSource {
  readonly name = 'block_api.get_block_range';
  private nodeIndex = 0;

  constructor(
    private logger: Logger,
    private nodes: string[],
    /** Blocks per request. Bigger means fewer requests but larger responses. */
    readonly batchSize: number = 200,
    private fetcher: Fetch = (...args) => fetch(...args),
  ) {
    if (!nodes.length) throw new Error('BlockRangeMoveSource needs at least one node');
  }

  async headBlock(): Promise<number> {
    const { result } = await this.call<{ last_irreversible_block_num: number }>(
      'condenser_api.get_dynamic_global_properties', [],
    );
    return result.last_irreversible_block_num;
  }

  async read(from: number, to: number, id: string): Promise<ReadResult> {
    const ops: ChainOp[] = [];
    let bytes = 0;
    for (let start = from; start <= to; start += this.batchSize) {
      const count = Math.min(this.batchSize, to - start + 1);
      const res = await this.call<{ blocks: RangeBlock[] }>(
        'block_api.get_block_range', { starting_block_num: start, count },
      );
      bytes += res.bytes;
      const blocks = res.result.blocks ?? [];
      blocks.forEach((b, i) => collect(b, start + i, id, ops));
      // A node may return fewer blocks than asked; the caller resumes from
      // the last block it was given.
      if (blocks.length < count) {
        if (!blocks.length) throw new Error(`no blocks returned from ${start}`);
        return { ops, bytes, lastBlock: start + blocks.length - 1 };
      }
    }
    return { ops, bytes };
  }

  private async call<T>(method: string, params: unknown): Promise<{ result: T; bytes: number }> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < this.nodes.length; attempt++) {
      const node = this.nodes[this.nodeIndex]!;
      try {
        const response = await this.fetcher(node, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
          signal: AbortSignal.timeout(30000),
        });
        const text = await response.text();
        const data = JSON.parse(text) as { result?: T; error?: unknown };
        if (data.result === undefined) throw new Error(`${method}: ${JSON.stringify(data.error ?? 'no result')}`);
        return { result: data.result, bytes: text.length };
      } catch (err) {
        lastErr = err;
        this.logger.warn(`[MoveSource] ${node} failed ${method}: ${err}`);
        this.nodeIndex = (this.nodeIndex + 1) % this.nodes.length;
      }
    }
    throw lastErr;
  }
}

interface RangeBlock {
  timestamp: string;
  transactions?: Array<{ operations?: Array<{ type: string; value: Record<string, unknown> }> }>;
}

function collect(block: RangeBlock, num: number, id: string, out: ChainOp[]): void {
  // Block timestamps are UTC without a zone suffix.
  const time = Date.parse(`${block.timestamp}Z`);
  for (const tx of block.transactions ?? []) {
    for (const op of tx.operations ?? []) {
      if (op.type !== 'custom_json_operation' || op.value['id'] !== id) continue;
      const auths = op.value['required_posting_auths'];
      const account = Array.isArray(auths) ? auths[0] : undefined;
      if (typeof account !== 'string') continue;
      out.push({ block: num, time, account, id, json: String(op.value['json'] ?? '') });
    }
  }
}
